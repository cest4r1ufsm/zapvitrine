let client;
function getClient() {
  if (!client && process.env.REDIS_URL) {
    client = require('redis').createClient({ url: process.env.REDIS_URL,
      socket: { connectTimeout: 5000, reconnectStrategy: retries => Math.min(200 * retries, 3000) } });
    client.on('error', () => console.error('Shared rate-limit store unavailable'));
  }
  return client;
}
function limitStore(prefix) {
  const redis = getClient();
  if (!redis) {
    if (process.env.NODE_ENV === 'production') throw new Error('REDIS_URL obrigatório em produção');
    return {};
  }
  const { RedisStore } = require('rate-limit-redis');
  return { store: new RedisStore({ prefix: `agt:${prefix}:`, sendCommand: (...args) => redis.sendCommand(args) }), passOnStoreError: false };
}
async function connect() { const redis = getClient(); if (redis && !redis.isOpen) await redis.connect(); }
async function close() { if (client?.isOpen) await client.quit(); }
module.exports = { limitStore, connect, close, getClient };
