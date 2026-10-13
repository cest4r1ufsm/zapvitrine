import test from 'node:test';
import assert from 'node:assert/strict';
import { launchMetaSignup, parseSignupEvent } from '../src/services/metaSignup.js';

test('accepts official coexistence completion without phone ID and rejects spoofed origins', () => {
  const payload = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', data: { waba_id: '123' } };
  assert.deepEqual(parseSignupEvent({ origin: 'https://www.facebook.com', data: JSON.stringify(payload) }), { type: 'finish', wabaId: '123' });
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
    assert.deepEqual(result, { code: 'synthetic-code', wabaId: '123', phoneId: '456' });
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
