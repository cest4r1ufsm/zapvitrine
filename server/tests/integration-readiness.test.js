const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectIntegrations } = require('../src/lib/integrationReadiness');
test('integration diagnostics never expose secret values or imply external activation', () => {
  const marker = 'never-print-this-secret';
  const env = Object.fromEntries(['DATABASE_URL','REDIS_URL','MEDIA_BUCKET','MEDIA_PUBLIC_URL','AWS_REGION','META_APP_ID','META_APP_SECRET','META_SIGNUP_CONFIG_ID','META_WEBHOOK_VERIFY_TOKEN','SMTP_HOST','SMTP_USER','SMTP_PASS','STRIPE_SECRET_KEY','STRIPE_PRICE_ID','STRIPE_WEBHOOK_SECRET','PLAY_SERVICE_ACCOUNT_JSON','MAPBOX_GEOCODING_TOKEN'].map(key => [key, marker]));
  Object.assign(env, { DATABASE_URL: 'postgresql://example', REDIS_URL: 'rediss://example', MEDIA_STORAGE: 's3', WHATSAPP_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64), MAPBOX_PERMANENT_GEOCODING: 'true' });
  const result = inspectIntegrations(env);
  assert.ok(!JSON.stringify(result).includes(marker));
  assert.ok(Object.values(result).every(item => item.status === 'configured_not_verified'));
});
test('missing, development-only and malformed settings remain explicit', () => {
  const empty = inspectIntegrations({});
  assert.ok(Object.values(empty).every(item => item.status === 'incomplete'));
  const result = inspectIntegrations({ DATABASE_URL: 'file:dev.db', REDIS_URL: 'redis://local', WHATSAPP_TOKEN_ENCRYPTION_KEY: 'bad' });
  assert.equal(result.database.status, 'development_only');
  assert.equal(result.redis.status, 'development_only');
  assert.ok(result.whatsapp.missing.includes('WHATSAPP_TOKEN_ENCRYPTION_KEY válida'));
});
