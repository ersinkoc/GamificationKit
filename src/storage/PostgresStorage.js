import { StorageInterface } from './StorageInterface.js';

export class PostgresStorage extends StorageInterface {
  constructor(options = {}) {
    super(options);
    this.client = null;
    this.pg = null;
    this.tablePrefix = options.tablePrefix || 'gk_';
    this.cleanupInterval = null; // Fix BUG-025: Store interval reference
  }

  async connect() {
    try {
      const pg = await import('pg');
      this.pg = pg;
      
      const { Pool } = pg.default || pg;
      
      this.client = new Pool({
        host: this.options.host || 'localhost',
        port: this.options.port || 5432,
        database: this.options.database || 'gamification',
        user: this.options.user,
        password: this.options.password,
        ...this.options
      });

      await this.createTables();
      this.connected = true;
      
      this.startCleanupJob();
      
      return true;
    } catch (error) {
      throw new Error(`Failed to connect to PostgreSQL: ${error.message}`);
    }
  }

  async createTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS ${this.tablePrefix}keyvalue (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${this.tablePrefix}sortedsets (
        key VARCHAR(255),
        member VARCHAR(255),
        score DOUBLE PRECISION,
        PRIMARY KEY (key, member)
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${this.tablePrefix}lists (
        key VARCHAR(255) PRIMARY KEY,
        values JSONB DEFAULT '[]'
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${this.tablePrefix}sets (
        key VARCHAR(255),
        member VARCHAR(255),
        PRIMARY KEY (key, member)
      )`,
      
      `CREATE TABLE IF NOT EXISTS ${this.tablePrefix}hashes (
        key VARCHAR(255),
        field VARCHAR(255),
        value JSONB,
        PRIMARY KEY (key, field)
      )`,
      
      `CREATE INDEX IF NOT EXISTS idx_${this.tablePrefix}keyvalue_expires 
        ON ${this.tablePrefix}keyvalue(expires_at) 
        WHERE expires_at IS NOT NULL`,
      
      `CREATE INDEX IF NOT EXISTS idx_${this.tablePrefix}sortedsets_score 
        ON ${this.tablePrefix}sortedsets(key, score)`
    ];

    for (const query of queries) {
      await this.client.query(query);
    }
  }

  startCleanupJob() {
    // Fix BUG-025: Store interval reference and prevent multiple intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(async () => {
      try {
        await this.client.query(
          `DELETE FROM ${this.tablePrefix}keyvalue WHERE expires_at < NOW()`
        );
      } catch (error) {
        console.error('Cleanup job error:', error);
      }
    }, 60000);
  }

  async disconnect() {
    // Fix BUG-025: Clear cleanup interval on disconnect
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.client) {
      await this.client.end();
      this.connected = false;
    }
    return true;
  }

  async get(key) {
    const result = await this.client.query(
      `SELECT value FROM ${this.tablePrefix}keyvalue 
       WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [key]
    );
    
    return result.rows.length > 0 ? result.rows[0].value : null;
  }

  async set(key, value, ttl) {
    // Fix BUG-001: SQL Injection - use parameterized query for TTL
    if (ttl) {
      await this.client.query(
        `INSERT INTO ${this.tablePrefix}keyvalue (key, value, expires_at, updated_at)
         VALUES ($1, $2, NOW() + ($3 || ' seconds')::INTERVAL, NOW())
         ON CONFLICT (key)
         DO UPDATE SET value = $2, expires_at = NOW() + ($3 || ' seconds')::INTERVAL, updated_at = NOW()`,
        [key, JSON.stringify(value), ttl.toString()]
      );
    } else {
      await this.client.query(
        `INSERT INTO ${this.tablePrefix}keyvalue (key, value, expires_at, updated_at)
         VALUES ($1, $2, NULL, NOW())
         ON CONFLICT (key)
         DO UPDATE SET value = $2, expires_at = NULL, updated_at = NOW()`,
        [key, JSON.stringify(value)]
      );
    }

    return true;
  }

  async delete(key) {
    const queries = [
      `DELETE FROM ${this.tablePrefix}keyvalue WHERE key = $1`,
      `DELETE FROM ${this.tablePrefix}sortedsets WHERE key = $1`,
      `DELETE FROM ${this.tablePrefix}lists WHERE key = $1`,
      `DELETE FROM ${this.tablePrefix}sets WHERE key = $1`,
      `DELETE FROM ${this.tablePrefix}hashes WHERE key = $1`
    ];
    
    let deleted = false;
    
    for (const query of queries) {
      const result = await this.client.query(query, [key]);
      if (result.rowCount > 0) deleted = true;
    }
    
    return deleted;
  }

  async exists(key) {
    const queries = [
      `SELECT 1 FROM ${this.tablePrefix}keyvalue WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      `SELECT 1 FROM ${this.tablePrefix}sortedsets WHERE key = $1 LIMIT 1`,
      `SELECT 1 FROM ${this.tablePrefix}lists WHERE key = $1`,
      `SELECT 1 FROM ${this.tablePrefix}sets WHERE key = $1 LIMIT 1`,
      `SELECT 1 FROM ${this.tablePrefix}hashes WHERE key = $1 LIMIT 1`
    ];
    
    for (const query of queries) {
      const result = await this.client.query(query, [key]);
      if (result.rows.length > 0) return true;
    }
    
    return false;
  }

  async increment(key, amount = 1) {
    const result = await this.client.query(
      `INSERT INTO ${this.tablePrefix}keyvalue (key, value) 
       VALUES ($1, $2)
       ON CONFLICT (key) 
       DO UPDATE SET value = (COALESCE((${this.tablePrefix}keyvalue.value)::numeric, 0) + $2)::jsonb,
                     updated_at = NOW()
       RETURNING value`,
      [key, amount]
    );
    
    return Number(result.rows[0].value);
  }

  async decrement(key, amount = 1) {
    return this.increment(key, -amount);
  }

  async mget(keys) {
    if (keys.length === 0) return {};
    
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const result = await this.client.query(
      `SELECT key, value FROM ${this.tablePrefix}keyvalue 
       WHERE key IN (${placeholders}) 
       AND (expires_at IS NULL OR expires_at > NOW())`,
      keys
    );
    
    const map = {};
    result.rows.forEach(row => {
      map[row.key] = row.value;
    });
    
    const finalResult = {};
    keys.forEach(key => {
      finalResult[key] = map[key] || null;
    });
    
    return finalResult;
  }

  async mset(entries) {
    const values = [];
    const placeholders = [];
    let index = 1;
    
    for (const [key, value] of Object.entries(entries)) {
      values.push(key, JSON.stringify(value));
      placeholders.push(`($${index}, $${index + 1})`);
      index += 2;
    }
    
    await this.client.query(
      `INSERT INTO ${this.tablePrefix}keyvalue (key, value) 
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (key) 
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      values
    );
    
    return true;
  }

  async keys(pattern) {
    const sqlPattern = pattern.replace(/\*/g, '%').replace(/\?/g, '_');
    
    const queries = [
      `SELECT DISTINCT key FROM ${this.tablePrefix}keyvalue WHERE key LIKE $1`,
      `SELECT DISTINCT key FROM ${this.tablePrefix}sortedsets WHERE key LIKE $1`,
      `SELECT DISTINCT key FROM ${this.tablePrefix}lists WHERE key LIKE $1`,
      `SELECT DISTINCT key FROM ${this.tablePrefix}sets WHERE key LIKE $1`,
      `SELECT DISTINCT key FROM ${this.tablePrefix}hashes WHERE key LIKE $1`
    ];
    
    const allKeys = new Set();
    
    for (const query of queries) {
      const result = await this.client.query(query, [sqlPattern]);
      result.rows.forEach(row => allKeys.add(row.key));
    }
    
    return Array.from(allKeys);
  }

  async clear(pattern) {
    const keys = await this.keys(pattern);
    let deleted = 0;
    
    for (const key of keys) {
      if (await this.delete(key)) {
        deleted++;
      }
    }
    
    return deleted;
  }

  async zadd(key, score, member) {
    await this.client.query(
      `INSERT INTO ${this.tablePrefix}sortedsets (key, member, score) 
       VALUES ($1, $2, $3)
       ON CONFLICT (key, member) 
       DO UPDATE SET score = $3`,
      [key, member, score]
    );
    
    return true;
  }

  async zrem(key, member) {
    const result = await this.client.query(
      `DELETE FROM ${this.tablePrefix}sortedsets 
       WHERE key = $1 AND member = $2`,
      [key, member]
    );
    
    return result.rowCount > 0;
  }

  async zrange(key, start, stop, options = {}) {
    const result = await this.client.query(
      `SELECT member, score FROM ${this.tablePrefix}sortedsets
       WHERE key = $1
       ORDER BY score ASC, member ASC`,
      [key]
    );

    const rows = result.rows;
    const actualStart = start < 0 ? rows.length + start : start;
    const actualStop = stop < 0 ? rows.length + stop + 1 : stop + 1;
    const sliced = rows.slice(actualStart, actualStop);

    // Fix BUG-041: Return array of objects format like MemoryStorage/MongoStorage
    if (options.withScores) {
      return sliced.map(r => ({ member: r.member, score: r.score }));
    }
    return sliced.map(r => r.member);
  }

  async zrevrange(key, start, stop, options = {}) {
    const result = await this.client.query(
      `SELECT member, score FROM ${this.tablePrefix}sortedsets
       WHERE key = $1
       ORDER BY score DESC, member DESC`,
      [key]
    );

    const rows = result.rows;
    const actualStart = start < 0 ? rows.length + start : start;
    const actualStop = stop < 0 ? rows.length + stop + 1 : stop + 1;
    const sliced = rows.slice(actualStart, actualStop);

    // Fix BUG-041: Return array of objects format like MemoryStorage/MongoStorage
    if (options.withScores) {
      return sliced.map(r => ({ member: r.member, score: r.score }));
    }
    return sliced.map(r => r.member);
  }

  async zrank(key, member) {
    const result = await this.client.query(
      `WITH ranked AS (
        SELECT member, ROW_NUMBER() OVER (ORDER BY score ASC, member ASC) - 1 as rank
        FROM ${this.tablePrefix}sortedsets
        WHERE key = $1
      )
      SELECT rank FROM ranked WHERE member = $2`,
      [key, member]
    );
    
    return result.rows.length > 0 ? result.rows[0].rank : null;
  }

  async zrevrank(key, member) {
    const result = await this.client.query(
      `WITH ranked AS (
        SELECT member, ROW_NUMBER() OVER (ORDER BY score DESC, member DESC) - 1 as rank
        FROM ${this.tablePrefix}sortedsets
        WHERE key = $1
      )
      SELECT rank FROM ranked WHERE member = $2`,
      [key, member]
    );
    
    return result.rows.length > 0 ? result.rows[0].rank : null;
  }

  async zscore(key, member) {
    const result = await this.client.query(
      `SELECT score FROM ${this.tablePrefix}sortedsets 
       WHERE key = $1 AND member = $2`,
      [key, member]
    );
    
    return result.rows.length > 0 ? result.rows[0].score : null;
  }

  async zcount(key, min, max) {
    // Fix BUG-040: Handle special Redis values '-inf' and '+inf'
    const minValue = min === '-inf' ? -Infinity : Number(min);
    const maxValue = max === '+inf' ? Infinity : Number(max);

    // Use text comparison for infinity values since PostgreSQL doesn't support infinity in parameterized queries
    let query;
    let params;

    if (minValue === -Infinity && maxValue === Infinity) {
      query = `SELECT COUNT(*) FROM ${this.tablePrefix}sortedsets WHERE key = $1`;
      params = [key];
    } else if (minValue === -Infinity) {
      query = `SELECT COUNT(*) FROM ${this.tablePrefix}sortedsets WHERE key = $1 AND score <= $2`;
      params = [key, maxValue];
    } else if (maxValue === Infinity) {
      query = `SELECT COUNT(*) FROM ${this.tablePrefix}sortedsets WHERE key = $1 AND score >= $2`;
      params = [key, minValue];
    } else {
      query = `SELECT COUNT(*) FROM ${this.tablePrefix}sortedsets WHERE key = $1 AND score >= $2 AND score <= $3`;
      params = [key, minValue, maxValue];
    }

    const result = await this.client.query(query, params);
    return parseInt(result.rows[0].count);
  }

  async zincrby(key, increment, member) {
    const result = await this.client.query(
      `INSERT INTO ${this.tablePrefix}sortedsets (key, member, score) 
       VALUES ($1, $2, $3)
       ON CONFLICT (key, member) 
       DO UPDATE SET score = ${this.tablePrefix}sortedsets.score + $3
       RETURNING score`,
      [key, member, increment]
    );
    
    return result.rows[0].score;
  }

  async lpush(key, ...values) {
    const result = await this.client.query(
      `INSERT INTO ${this.tablePrefix}lists (key, values) 
       VALUES ($1, $2)
       ON CONFLICT (key) 
       DO UPDATE SET values = $2 || ${this.tablePrefix}lists.values
       RETURNING jsonb_array_length(values)`,
      [key, JSON.stringify(values.reverse())]
    );
    
    return result.rows[0].jsonb_array_length;
  }

  async rpush(key, ...values) {
    const result = await this.client.query(
      `INSERT INTO ${this.tablePrefix}lists (key, values) 
       VALUES ($1, $2)
       ON CONFLICT (key) 
       DO UPDATE SET values = ${this.tablePrefix}lists.values || $2
       RETURNING jsonb_array_length(values)`,
      [key, JSON.stringify(values)]
    );
    
    return result.rows[0].jsonb_array_length;
  }

  async lpop(key) {
    const result = await this.client.query(
      `UPDATE ${this.tablePrefix}lists 
       SET values = values[1:]
       WHERE key = $1 AND jsonb_array_length(values) > 0
       RETURNING values[0]`,
      [key]
    );
    
    return result.rows.length > 0 ? result.rows[0]['?column?'] : null;
  }

  async rpop(key) {
    const result = await this.client.query(
      `UPDATE ${this.tablePrefix}lists 
       SET values = values[0:jsonb_array_length(values)-1]
       WHERE key = $1 AND jsonb_array_length(values) > 0
       RETURNING values[jsonb_array_length(values)-1]`,
      [key]
    );
    
    return result.rows.length > 0 ? result.rows[0]['?column?'] : null;
  }

  async lrange(key, start, stop) {
    const result = await this.client.query(
      `SELECT values FROM ${this.tablePrefix}lists WHERE key = $1`,
      [key]
    );
    
    if (result.rows.length === 0) return [];
    
    const list = result.rows[0].values;
    const actualStart = start < 0 ? list.length + start : start;
    const actualStop = stop < 0 ? list.length + stop + 1 : stop + 1;
    
    return list.slice(actualStart, actualStop);
  }

  async llen(key) {
    const result = await this.client.query(
      `SELECT jsonb_array_length(values) as length 
       FROM ${this.tablePrefix}lists WHERE key = $1`,
      [key]
    );
    
    return result.rows.length > 0 ? result.rows[0].length : 0;
  }

  async sadd(key, ...members) {
    const values = [];
    const placeholders = [];
    let index = 2;
    
    for (const member of members) {
      values.push(member);
      placeholders.push(`($1, $${index})`);
      index++;
    }
    
    const result = await this.client.query(
      `INSERT INTO ${this.tablePrefix}sets (key, member) 
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (key, member) DO NOTHING`,
      [key, ...values]
    );
    
    return result.rowCount;
  }

  async srem(key, ...members) {
    if (members.length === 0) return 0;
    
    const placeholders = members.map((_, i) => `$${i + 2}`).join(', ');
    const result = await this.client.query(
      `DELETE FROM ${this.tablePrefix}sets 
       WHERE key = $1 AND member IN (${placeholders})`,
      [key, ...members]
    );
    
    return result.rowCount;
  }

  async smembers(key) {
    const result = await this.client.query(
      `SELECT member FROM ${this.tablePrefix}sets WHERE key = $1`,
      [key]
    );
    
    return result.rows.map(r => r.member);
  }

  async sismember(key, member) {
    const result = await this.client.query(
      `SELECT 1 FROM ${this.tablePrefix}sets 
       WHERE key = $1 AND member = $2`,
      [key, member]
    );
    
    return result.rows.length > 0;
  }

  async scard(key) {
    const result = await this.client.query(
      `SELECT COUNT(*) FROM ${this.tablePrefix}sets WHERE key = $1`,
      [key]
    );
    
    return parseInt(result.rows[0].count);
  }

  async hset(key, field, value) {
    await this.client.query(
      `INSERT INTO ${this.tablePrefix}hashes (key, field, value) 
       VALUES ($1, $2, $3)
       ON CONFLICT (key, field) 
       DO UPDATE SET value = $3`,
      [key, field, JSON.stringify(value)]
    );
    
    return true;
  }

  async hget(key, field) {
    const result = await this.client.query(
      `SELECT value FROM ${this.tablePrefix}hashes 
       WHERE key = $1 AND field = $2`,
      [key, field]
    );
    
    return result.rows.length > 0 ? result.rows[0].value : null;
  }

  async hgetall(key) {
    const result = await this.client.query(
      `SELECT field, value FROM ${this.tablePrefix}hashes WHERE key = $1`,
      [key]
    );
    
    const hash = {};
    result.rows.forEach(row => {
      hash[row.field] = row.value;
    });
    
    return hash;
  }

  async hdel(key, ...fields) {
    if (fields.length === 0) return 0;
    
    const placeholders = fields.map((_, i) => `$${i + 2}`).join(', ');
    const result = await this.client.query(
      `DELETE FROM ${this.tablePrefix}hashes 
       WHERE key = $1 AND field IN (${placeholders})`,
      [key, ...fields]
    );
    
    return result.rowCount;
  }

  async hincrby(key, field, increment) {
    const result = await this.client.query(
      `INSERT INTO ${this.tablePrefix}hashes (key, field, value) 
       VALUES ($1, $2, $3)
       ON CONFLICT (key, field) 
       DO UPDATE SET value = (COALESCE((${this.tablePrefix}hashes.value)::numeric, 0) + $3)::jsonb
       RETURNING value`,
      [key, field, increment]
    );
    
    return Number(result.rows[0].value);
  }

  async expire(key, seconds) {
    // Fix BUG-002: SQL Injection - use parameterized query for seconds
    const result = await this.client.query(
      `UPDATE ${this.tablePrefix}keyvalue
       SET expires_at = NOW() + ($2 || ' seconds')::INTERVAL
       WHERE key = $1`,
      [key, seconds.toString()]
    );

    return result.rowCount > 0;
  }

  async ttl(key) {
    const result = await this.client.query(
      `SELECT EXTRACT(EPOCH FROM (expires_at - NOW()))::integer as ttl 
       FROM ${this.tablePrefix}keyvalue 
       WHERE key = $1`,
      [key]
    );
    
    if (result.rows.length === 0) return -2;
    if (result.rows[0].ttl === null) return -1;
    
    return Math.max(0, result.rows[0].ttl);
  }

  async transaction(operations) {
    const client = await this.client.connect();

    try {
      await client.query('BEGIN');

      // Fix BUG-008: Temporarily replace this.client with transaction client
      // so all operations execute within the transaction
      const originalClient = this.client;
      this.client = client;

      const results = [];
      try {
        for (const op of operations) {
          const { method, args } = op;
          const result = await this[method](...args);
          results.push(result);
        }
      } finally {
        // Restore original client
        this.client = originalClient;
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}