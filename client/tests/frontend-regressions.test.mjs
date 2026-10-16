import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hasPaidAccess, hasPremiumAccess } from '../src/services/entitlement.js';
import { localClockDate } from '../src/services/localClock.js';

test('national agenda derives the local day from the establishment timezone', () => {
  const instant = new Date('2026-10-15T03:30:00Z');
  assert.equal(localClockDate('America/Sao_Paulo', instant).toISOString(), '2026-10-15T00:30:00.000Z');
  assert.equal(localClockDate('America/Manaus', instant).toISOString(), '2026-10-14T23:30:00.000Z');
  assert.equal(localClockDate('America/Rio_Branco', instant).toISOString(), '2026-10-14T22:30:00.000Z');
  assert.equal(localClockDate('America/Noronha', instant).toISOString(), '2026-10-15T01:30:00.000Z');
});

test('paid access distinguishes Play validity, Stripe and trial', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  const play = { subscriptionStatus: 'active', subscriptionSource: 'play' };
  assert.equal(hasPaidAccess({ ...play, subscriptionExpiresAt: '2026-10-13T11:59:00Z' }, now), false);
  assert.equal(hasPaidAccess({ ...play, subscriptionExpiresAt: '2026-10-13T12:00:00Z' }, now), false);
  assert.equal(hasPaidAccess({ ...play, subscriptionExpiresAt: '2026-10-14T12:00:00Z' }, now), true);
  assert.equal(hasPaidAccess(play, now), false);
  assert.equal(hasPaidAccess({ subscriptionStatus: 'active', subscriptionSource: 'stripe' }, now), true);
  assert.equal(hasPremiumAccess({ ...play, trialEndsAt: '2026-10-14T12:00:00Z' }, now), true);
  assert.equal(hasPremiumAccess({ trialEndsAt: 'invalid' }, now), false);
});

test('API preserves HTTP rejection status and keeps network errors distinguishable', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  globalThis.window = { location: { hostname: 'localhost' } };
  globalThis.localStorage = { getItem: () => 'test-token' };
  try {
    // Vite replaces import.meta.env; provide that same environment for the Node test.
    const source = (await readFile(new URL('../src/services/api.js', import.meta.url), 'utf8'))
      .replaceAll('import.meta.env', '({})');
    const { authAPI, ApiError } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    for (const status of [401, 403, 500, 503]) {
      globalThis.fetch = async () => ({ ok: false, status, json: async () => ({ error: 'Falha simulada' }) });
      await assert.rejects(authAPI.me(), error => error instanceof ApiError && error.status === status);
    }
    globalThis.fetch = async () => { throw new TypeError('offline'); };
    await assert.rejects(authAPI.me(), error => error instanceof TypeError && error.status === undefined);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ user: { id: 1 } }) });
    assert.deepEqual(await authAPI.me(), { user: { id: 1 } });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.localStorage = originalStorage;
  }
});
