import { StorageInterface } from './StorageInterface.js';

export class MongoStorage extends StorageInterface {
  constructor(options = {}) {
    super(options);
    this.client = null;
    this.db = null;
    this.mongodb = null;
    this.dbName = options.database || 'gamification';
    this.collectionPrefix = options.collectionPrefix || 'gk_';
  }

  async connect() {
    try {
      const mongodb = await import('mongodb');
      this.mongodb = mongodb;
      
      const url = this.options.url || `mongodb://${this.options.host || 'localhost'}:${this.options.port || 27017}`;
      
      this.client = new mongodb.MongoClient(url, {
        ...this.options.clientOptions
      });

      await this.client.connect();
      this.db = this.client.db(this.dbName);
      
      await this.ensureIndexes();
      
      this.connected = true;
      return true;
    } catch (error) {
      throw new Error(`Failed to connect to MongoDB: ${error.message}`);
    }
  }

  async ensureIndexes() {
    const kvCollection = this.db.collection(`${this.collectionPrefix}keyvalue`);
    await kvCollection.createIndex({ key: 1 }, { unique: true });
    await kvCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    const sortedSetCollection = this.db.collection(`${this.collectionPrefix}sortedsets`);
    await sortedSetCollection.createIndex({ key: 1, score: -1 });
    await sortedSetCollection.createIndex({ key: 1, member: 1 }, { unique: true });
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.connected = false;
    }
    return true;
  }

  async get(key) {
    const collection = this.db.collection(`${this.collectionPrefix}keyvalue`);
    const doc = await collection.findOne({ key });
    
    if (!doc || (doc.expiresAt && doc.expiresAt < new Date())) {
      if (doc && doc.expiresAt < new Date()) {
        await collection.deleteOne({ key });
      }
      return null;
    }
    
    return doc.value;
  }

  async set(key, value, ttl) {
    const collection = this.db.collection(`${this.collectionPrefix}keyvalue`);
    const doc = {
      key,
      value,
      updatedAt: new Date()
    };
    
    if (ttl) {
      doc.expiresAt = new Date(Date.now() + ttl * 1000);
    }
    
    await collection.replaceOne(
      { key },
      doc,
      { upsert: true }
    );
    
    return true;
  }

  async delete(key) {
    const collections = [
      `${this.collectionPrefix}keyvalue`,
      `${this.collectionPrefix}sortedsets`,
      `${this.collectionPrefix}lists`,
      `${this.collectionPrefix}sets`,
      `${this.collectionPrefix}hashes`
    ];
    
    let deleted = false;
    
    for (const collName of collections) {
      const collection = this.db.collection(collName);
      const result = await collection.deleteMany({ key });
      if (result.deletedCount > 0) deleted = true;
    }
    
    return deleted;
  }

  async exists(key) {
    const collections = [
      `${this.collectionPrefix}keyvalue`,
      `${this.collectionPrefix}sortedsets`,
      `${this.collectionPrefix}lists`,
      `${this.collectionPrefix}sets`,
      `${this.collectionPrefix}hashes`
    ];
    
    for (const collName of collections) {
      const collection = this.db.collection(collName);
      const count = await collection.countDocuments({ key });
      if (count > 0) return true;
    }
    
    return false;
  }

  async increment(key, amount = 1) {
    const collection = this.db.collection(`${this.collectionPrefix}keyvalue`);
    const result = await collection.findOneAndUpdate(
      { key },
      {
        $inc: { value: amount },
        $set: { updatedAt: new Date() }
      },
      {
        returnDocument: 'after',
        upsert: true
      }
    );

    // Fix: Add null check to prevent crash if MongoDB returns null
    return result?.value?.value ?? amount;
  }

  async decrement(key, amount = 1) {
    return this.increment(key, -amount);
  }

  async mget(keys) {
    const collection = this.db.collection(`${this.collectionPrefix}keyvalue`);
    const docs = await collection.find({ key: { $in: keys } }).toArray();
    
    const result = {};
    const docMap = new Map(docs.map(d => [d.key, d]));
    
    for (const key of keys) {
      const doc = docMap.get(key);
      if (doc && (!doc.expiresAt || doc.expiresAt > new Date())) {
        result[key] = doc.value;
      } else {
        result[key] = null;
      }
    }
    
    return result;
  }

  async mset(entries) {
    const collection = this.db.collection(`${this.collectionPrefix}keyvalue`);
    const operations = [];
    
    for (const [key, value] of Object.entries(entries)) {
      operations.push({
        replaceOne: {
          filter: { key },
          replacement: {
            key,
            value,
            updatedAt: new Date()
          },
          upsert: true
        }
      });
    }
    
    await collection.bulkWrite(operations);
    return true;
  }

  async keys(pattern) {
    // Fix BUG-027: Escape regex special characters before converting wildcards
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars
      .replace(/\*/g, '.*')  // Then convert wildcards
      .replace(/\?/g, '.');
    const regex = new RegExp('^' + escaped + '$');
    const collections = [
      `${this.collectionPrefix}keyvalue`,
      `${this.collectionPrefix}sortedsets`,
      `${this.collectionPrefix}lists`,
      `${this.collectionPrefix}sets`,
      `${this.collectionPrefix}hashes`
    ];
    
    const allKeys = new Set();
    
    for (const collName of collections) {
      const collection = this.db.collection(collName);
      const keys = await collection.distinct('key', { key: { $regex: regex } });
      keys.forEach(k => allKeys.add(k));
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
    const collection = this.db.collection(`${this.collectionPrefix}sortedsets`);
    // Fix BUG-038: Return count instead of boolean to match MemoryStorage
    const doc = await collection.findOne({ key, member });
    await collection.replaceOne(
      { key, member },
      { key, member, score },
      { upsert: true }
    );
    return doc ? 0 : 1;  // Return 1 if new, 0 if updated
  }

  async zrem(key, member) {
    const collection = this.db.collection(`${this.collectionPrefix}sortedsets`);
    const result = await collection.deleteOne({ key, member });
    return result.deletedCount > 0;
  }

  async zrange(key, start, stop, options = {}) {
    const collection = this.db.collection(`${this.collectionPrefix}sortedsets`);
    const docs = await collection
      .find({ key })
      .sort({ score: 1 })
      .toArray();
    
    const actualStart = start < 0 ? docs.length + start : start;
    const actualStop = stop < 0 ? docs.length + stop + 1 : stop + 1;
    const sliced = docs.slice(actualStart, actualStop);
    
    // Fix BUG-028: Return array of objects format like MemoryStorage
    if (options.withScores) {
      return sliced.map(d => ({ member: d.member, score: d.score }));
    }
    return sliced.map(d => d.member);
  }

  async zrevrange(key, start, stop, options = {}) {
    const collection = this.db.collection(`${this.collectionPrefix}sortedsets`);
    const docs = await collection
      .find({ key })
      .sort({ score: -1 })
      .toArray();
    
    const actualStart = start < 0 ? docs.length + start : start;
    const actualStop = stop < 0 ? docs.length + stop + 1 : stop + 1;
    const sliced = docs.slice(actualStart, actualStop);
    
    // Fix BUG-028: Return array of objects format like MemoryStorage
    if (options.withScores) {
      return sliced.map(d => ({ member: d.member, score: d.score }));
    }
    return sliced.map(d => d.member);
  }

  async zrank(key, member) {
    const collection = this.db.collection(`${this.collectionPrefix}sortedsets`);
    const docs = await collection
      .find({ key })
      .sort({ score: 1 })
      .toArray();
    
    const index = docs.findIndex(d => d.member === member);
    return index === -1 ? null : index;
  }

  async zrevrank(key, member) {
    const collection = this.db.collection(`${this.collectionPrefix}sortedsets`);
    const docs = await collection
      .find({ key })
      .sort({ score: -1 })
      .toArray();
    
    const index = docs.findIndex(d => d.member === member);
    return index === -1 ? null : index;
  }

  async zscore(key, member) {
    const collection = this.db.collection(`${this.collectionPrefix}sortedsets`);
    const doc = await collection.findOne({ key, member });
    return doc ? doc.score : null;
  }

  async zcount(key, min, max) {
    const collection = this.db.collection(`${this.collectionPrefix}sortedsets`);

    // Fix BUG-039: Handle special Redis values '-inf' and '+inf'
    const minValue = min === '-inf' ? -Infinity : Number(min);
    const maxValue = max === '+inf' ? Infinity : Number(max);

    return await collection.countDocuments({
      key,
      score: { $gte: minValue, $lte: maxValue }
    });
  }

  async zincrby(key, increment, member) {
    const collection = this.db.collection(`${this.collectionPrefix}sortedsets`);
    const result = await collection.findOneAndUpdate(
      { key, member },
      {
        $inc: { score: increment },
        $setOnInsert: { key, member }
      },
      {
        returnDocument: 'after',
        upsert: true
      }
    );

    // Fix: Add null check to prevent crash if MongoDB returns null
    return result?.value?.score ?? increment;
  }

  async lpush(key, ...values) {
    const collection = this.db.collection(`${this.collectionPrefix}lists`);
    await collection.updateOne(
      { key },
      { 
        $push: { values: { $each: values.reverse(), $position: 0 } },
        $setOnInsert: { key }
      },
      { upsert: true }
    );
    
    // Fix BUG-035: Add null check for doc
    const doc = await collection.findOne({ key });
    return doc ? doc.values.length : 0;
  }

  async rpush(key, ...values) {
    const collection = this.db.collection(`${this.collectionPrefix}lists`);
    await collection.updateOne(
      { key },
      { 
        $push: { values: { $each: values } },
        $setOnInsert: { key }
      },
      { upsert: true }
    );
    
    // Fix BUG-036: Add null check for doc
    const doc = await collection.findOne({ key });
    return doc ? doc.values.length : 0;
  }

  async lpop(key) {
    const collection = this.db.collection(`${this.collectionPrefix}lists`);
    const result = await collection.findOneAndUpdate(
      { key },
      { $pop: { values: -1 } },
      { returnDocument: 'before' }
    );
    
    return result.value && result.value.values.length > 0 ? 
      result.value.values[0] : null;
  }

  async rpop(key) {
    const collection = this.db.collection(`${this.collectionPrefix}lists`);
    const result = await collection.findOneAndUpdate(
      { key },
      { $pop: { values: 1 } },
      { returnDocument: 'before' }
    );
    
    return result.value && result.value.values.length > 0 ? 
      result.value.values[result.value.values.length - 1] : null;
  }

  async lrange(key, start, stop) {
    const collection = this.db.collection(`${this.collectionPrefix}lists`);
    const doc = await collection.findOne({ key });
    
    if (!doc || !doc.values) return [];
    
    const list = doc.values;
    const actualStart = start < 0 ? list.length + start : start;
    const actualStop = stop < 0 ? list.length + stop + 1 : stop + 1;
    
    return list.slice(actualStart, actualStop);
  }

  async llen(key) {
    const collection = this.db.collection(`${this.collectionPrefix}lists`);
    const doc = await collection.findOne({ key });
    return doc && doc.values ? doc.values.length : 0;
  }

  async sadd(key, ...members) {
    const collection = this.db.collection(`${this.collectionPrefix}sets`);
    const result = await collection.updateOne(
      { key },
      { 
        $addToSet: { members: { $each: members } },
        $setOnInsert: { key }
      },
      { upsert: true }
    );
    
    return result.modifiedCount || result.upsertedCount;
  }

  async srem(key, ...members) {
    const collection = this.db.collection(`${this.collectionPrefix}sets`);
    const result = await collection.updateOne(
      { key },
      { $pull: { members: { $in: members } } }
    );
    
    return result.modifiedCount;
  }

  async smembers(key) {
    const collection = this.db.collection(`${this.collectionPrefix}sets`);
    const doc = await collection.findOne({ key });
    return doc && doc.members ? doc.members : [];
  }

  async sismember(key, member) {
    const collection = this.db.collection(`${this.collectionPrefix}sets`);
    const count = await collection.countDocuments({
      key,
      members: member
    });
    return count > 0;
  }

  async scard(key) {
    const collection = this.db.collection(`${this.collectionPrefix}sets`);
    const doc = await collection.findOne({ key });
    return doc && doc.members ? doc.members.length : 0;
  }

  async hset(key, field, value) {
    const collection = this.db.collection(`${this.collectionPrefix}hashes`);
    await collection.updateOne(
      { key },
      { 
        $set: { [`fields.${field}`]: value },
        $setOnInsert: { key }
      },
      { upsert: true }
    );
    return true;
  }

  async hget(key, field) {
    const collection = this.db.collection(`${this.collectionPrefix}hashes`);
    const doc = await collection.findOne({ key });
    return doc && doc.fields && doc.fields[field] !== undefined ? 
      doc.fields[field] : null;
  }

  async hgetall(key) {
    const collection = this.db.collection(`${this.collectionPrefix}hashes`);
    const doc = await collection.findOne({ key });
    return doc && doc.fields ? doc.fields : {};
  }

  async hdel(key, ...fields) {
    const collection = this.db.collection(`${this.collectionPrefix}hashes`);
    const unset = {};
    fields.forEach(f => unset[`fields.${f}`] = 1);
    
    const result = await collection.updateOne(
      { key },
      { $unset: unset }
    );
    
    return result.modifiedCount;
  }

  async hincrby(key, field, increment) {
    const collection = this.db.collection(`${this.collectionPrefix}hashes`);
    const result = await collection.findOneAndUpdate(
      { key },
      {
        $inc: { [`fields.${field}`]: increment },
        $setOnInsert: { key }
      },
      {
        returnDocument: 'after',
        upsert: true
      }
    );

    // Fix: Add null check to prevent crash if MongoDB returns null
    return result?.value?.fields?.[field] ?? increment;
  }

  async expire(key, seconds) {
    const collection = this.db.collection(`${this.collectionPrefix}keyvalue`);
    const result = await collection.updateOne(
      { key },
      { $set: { expiresAt: new Date(Date.now() + seconds * 1000) } }
    );
    
    return result.modifiedCount > 0;
  }

  async ttl(key) {
    const collection = this.db.collection(`${this.collectionPrefix}keyvalue`);
    const doc = await collection.findOne({ key });
    
    if (!doc) return -2;
    if (!doc.expiresAt) return -1;
    
    const ttl = Math.floor((doc.expiresAt.getTime() - Date.now()) / 1000);
    return ttl > 0 ? ttl : -2;
  }

  async transaction(operations) {
    const session = this.client.startSession();
    
    try {
      const results = await session.withTransaction(async () => {
        const results = [];
        for (const op of operations) {
          const { method, args } = op;
          const result = await this[method](...args);
          results.push(result);
        }
        return results;
      });
      
      return results;
    } finally {
      await session.endSession();
    }
  }
}