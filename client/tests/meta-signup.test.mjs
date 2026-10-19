import test from 'node:test';
import assert from 'node:assert/strict';
import { launchMetaSignup, parseSignupEvent } from '../src/services/metaSignup.js';

test('accepts official coexistence completion without phone ID and rejects spoofed origins', () => {
  const payload = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', data: { waba_id: '123' } };
  assert.deepEqual(parseSignupEvent({ origin: 'https://www.facebook.com', data: JSON.stringify(payload) }), { type: 'finish', wabaId: '123', onboarding: 'business_app' });
  assert.equal(parseSignupEvent({ origin: 'https://m.facebook.com', data: payload }).type, 'finish', 'mobile Facebook origin accepted');
  for (const origin of ['https://evilfacebook.com', 'https://www.facebook.com.evil.com', 'http://www.facebook.com', 'null']) assert.equal(parseSignupEvent({ origin, data: payload }), null);
  assert.equal(parseSignupEvent({ origin: 'https://www.facebook.com', data: '{' }), null);
});

test('OAuth and session callbacks can arrive in either order; completes only once and cleans listener', () => {
  for (const order of ['code-first', 'session-first']) {
    const target = new EventTarget();
    globalThis.window = target;
    let callback;
    let complete = 0;
    let result;
    const fb = { login(cb, options) { callback = cb; assert.equal(options.extras.featureType, 'whatsapp_business_app_onboarding'); } };
    const cleanup = launchMetaSignup({ fb, configId: '345', onComplete(payload) { complete++; result = payload; }, onError(error) { throw error; }, onCancel() { throw new Error('unexpected cancel'); } });
    const sendSession = () => {
      const event = new Event('message');
      Object.assign(event, { origin: 'https://www.facebook.com', data: { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '123', phone_number_id: '456' } } });
      target.dispatchEvent(event);
    };
    if (order === 'code-first') { callback({ authResponse: { code: 'synthetic-code' } }); sendSession(); }
    else { sendSession(); callback({ authResponse: { code: 'synthetic-code' } }); }
    sendSession(); callback({ authResponse: { code: 'other-code' } });
    assert.equal(complete, 1);
    assert.deepEqual(result, { code: 'synthetic-code', wabaId: '123', phoneId: '456', onboarding: 'cloud_api' });
    cleanup();
  }
  delete globalThis.window;
});

test('cancelled signup clears sensitive pending code and never completes later', () => {
  const target = new EventTarget();
  globalThis.window = target;
  let callback;
  let cancelled = 0;
  let completed = 0;
  const cleanup = launchMetaSignup({ fb: { login(cb) { callback = cb; } }, configId: '123', onCancel() { cancelled++; }, onError(error) { throw error; }, onComplete() { completed++; } });
  callback({ authResponse: { code: 'temporary-code' } });
  const event = new Event('message');
  Object.assign(event, { origin: 'https://www.facebook.com', data: { type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL' } });
  target.dispatchEvent(event);
  callback({ authResponse: { code: 'late-code' } });
  assert.equal(cancelled, 1); assert.equal(completed, 0);
  cleanup(); delete globalThis.window;
});

test('uses the real SDK at click time, not the temporary object captured while loading', () => {
  const target = new EventTarget();
  let realCalls = 0;
  let stubCalls = 0;
  Object.assign(target, { __agtMetaSdkReady: true, FB: { login() { realCalls++; } } });
  globalThis.window = target;
  const cleanup = launchMetaSignup({ fb: { login() { stubCalls++; } }, configId: '1', onComplete() {}, onError(error) { throw error; }, onCancel() {} });
  assert.equal(realCalls, 1);
  assert.equal(stubCalls, 0);
  cleanup(); delete globalThis.window;
});

test('Meta on-screen errors arrive as CANCEL and are shown with the real reason', () => {
  const parsed = parseSignupEvent({ origin: 'https://www.facebook.com', data: { type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: { error_message: 'Nome de exibição inválido', session_id: 'abc' } } });
  assert.deepEqual(parsed, { type: 'error', message: 'Nome de exibição inválido', sessionId: 'abc' });
  assert.equal(parseSignupEvent({ origin: 'https://www.facebook.com', data: { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_ONLY_WABA', data: { waba_id: '1' } } }).type, 'error');
});

test('a code without the session message still completes, so the server can find the account', async () => {
  const target = new EventTarget();
  globalThis.window = target;
  let callback; let result;
  launchMetaSignup({ fb: { login(cb) { callback = cb; } }, configId: '1', onComplete(payload) { result = payload; }, onError(error) { throw error; }, onCancel() { throw new Error('cancel'); } });
  const realSetTimeout = globalThis.setTimeout;
  callback({ authResponse: { code: 'only-code' } });
  await new Promise(r => realSetTimeout(r, 8200));
  assert.deepEqual(result, { code: 'only-code', onboarding: 'business_app' });
  delete globalThis.window;
});
