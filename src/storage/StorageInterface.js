export class StorageInterface {
  constructor(options = {}) {
    this.options = options;
    this.connected = false;
  }

  async connect() {
    throw new Error('connect() must be implemented by storage adapter');
  }

  async disconnect() {
    throw new Error('disconnect() must be implemented by storage adapter');
  }

  async get(key) {
    throw new Error('get() must be implemented by storage adapter');
  }

  async set(key, value, ttl) {
    throw new Error('set() must be implemented by storage adapter');
  }

  async delete(key) {
    throw new Error('delete() must be implemented by storage adapter');
  }

  async exists(key) {
    throw new Error('exists() must be implemented by storage adapter');
  }

  async increment(key, amount = 1) {
    throw new Error('increment() must be implemented by storage adapter');
  }

  async decrement(key, amount = 1) {
    throw new Error('decrement() must be implemented by storage adapter');
  }

  async mget(keys) {
    throw new Error('mget() must be implemented by storage adapter');
  }

  async mset(entries) {
    throw new Error('mset() must be implemented by storage adapter');
  }

  async keys(pattern) {
    throw new Error('keys() must be implemented by storage adapter');
  }

  async clear(pattern) {
    throw new Error('clear() must be implemented by storage adapter');
  }

  async zadd(key, score, member) {
    throw new Error('zadd() must be implemented by storage adapter');
  }

  async zrem(key, member) {
    throw new Error('zrem() must be implemented by storage adapter');
  }

  async zrange(key, start, stop, options = {}) {
    throw new Error('zrange() must be implemented by storage adapter');
  }

  async zrevrange(key, start, stop, options = {}) {
    throw new Error('zrevrange() must be implemented by storage adapter');
  }

  async zrank(key, member) {
    throw new Error('zrank() must be implemented by storage adapter');
  }

  async zrevrank(key, member) {
    throw new Error('zrevrank() must be implemented by storage adapter');
  }

  async zscore(key, member) {
    throw new Error('zscore() must be implemented by storage adapter');
  }

  async zcount(key, min, max) {
    throw new Error('zcount() must be implemented by storage adapter');
  }

  async zincrby(key, increment, member) {
    throw new Error('zincrby() must be implemented by storage adapter');
  }

  async lpush(key, ...values) {
    throw new Error('lpush() must be implemented by storage adapter');
  }

  async rpush(key, ...values) {
    throw new Error('rpush() must be implemented by storage adapter');
  }

  async lpop(key) {
    throw new Error('lpop() must be implemented by storage adapter');
  }

  async rpop(key) {
    throw new Error('rpop() must be implemented by storage adapter');
  }

  async lrange(key, start, stop) {
    throw new Error('lrange() must be implemented by storage adapter');
  }

  async llen(key) {
    throw new Error('llen() must be implemented by storage adapter');
  }

  async sadd(key, ...members) {
    throw new Error('sadd() must be implemented by storage adapter');
  }

  async srem(key, ...members) {
    throw new Error('srem() must be implemented by storage adapter');
  }

  async smembers(key) {
    throw new Error('smembers() must be implemented by storage adapter');
  }

  async sismember(key, member) {
    throw new Error('sismember() must be implemented by storage adapter');
  }

  async scard(key) {
    throw new Error('scard() must be implemented by storage adapter');
  }

  async hset(key, field, value) {
    throw new Error('hset() must be implemented by storage adapter');
  }

  async hget(key, field) {
    throw new Error('hget() must be implemented by storage adapter');
  }

  async hgetall(key) {
    throw new Error('hgetall() must be implemented by storage adapter');
  }

  async hdel(key, ...fields) {
    throw new Error('hdel() must be implemented by storage adapter');
  }

  async hincrby(key, field, increment) {
    throw new Error('hincrby() must be implemented by storage adapter');
  }

  async expire(key, seconds) {
    throw new Error('expire() must be implemented by storage adapter');
  }

  async ttl(key) {
    throw new Error('ttl() must be implemented by storage adapter');
  }

  async transaction(operations) {
    throw new Error('transaction() must be implemented by storage adapter');
  }

  isConnected() {
    return this.connected;
  }
}