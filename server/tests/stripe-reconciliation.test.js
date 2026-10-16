const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileStripeEvent } = require('../src/services/stripeReconciliation');
function fixture(overrides = {}, status = 'active') {
  const store = { id: 1, stripeSubscriptionId: null, stripeCustomerId: null, subscriptionSource: null, subscriptionStatus: 'free', ...overrides };
  let stopped = 0, fetched = 0;
  const prisma = { store: { findUnique: async () => store, findFirst: async () => store, update: async ({ data }) => Object.assign(store, data) } };
  const stripe = { subscriptions: { retrieve: async id => { fetched++; return { id, customer: 'cus_1', status }; } } };
  const event = { type: 'checkout.session.completed', data: { object: { subscription: 'sub_1', customer: 'cus_1', mode: 'subscription', client_reference_id: '1' } } };
  return { store, event, counts: () => ({ stopped, fetched }), run: () => reconcileStripeEvent({ event, prisma, stripe, withStoreLock: (id, fn) => fn(), stopSession: async () => { stopped++; } }) };
}
test('checkout incomplete never grants premium', async () => {
  const f = fixture({}, 'incomplete'); await f.run(); assert.equal(f.store.subscriptionStatus, 'incomplete'); assert.equal(f.store.plan, 'free'); assert.equal(f.store.botEnabled, false);
});
test('late deleted event reconciles current active Stripe state', async () => {
  const f = fixture({ stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1' }); f.event.type = 'customer.subscription.deleted'; f.event.data.object = { id: 'sub_1', status: 'canceled' };
  await f.run(); assert.equal(f.store.subscriptionStatus, 'active'); assert.equal(f.counts().stopped, 0);
});
test('late Stripe event cannot overwrite active Play subscription', async () => {
  const f = fixture({ subscriptionSource: 'play', subscriptionStatus: 'active' }, 'canceled'); await f.run(); assert.equal(f.store.subscriptionSource, 'play'); assert.equal(f.counts().fetched, 0);
});
test('foreign customer or replacement subscription rejected', async () => {
  const f = fixture({ stripeCustomerId: 'cus_other' }); await f.run(); assert.equal(f.store.subscriptionStatus, 'free');
  const g = fixture({ stripeSubscriptionId: 'sub_new' }); await g.run(); assert.equal(g.store.subscriptionStatus, 'free');
});
test('current active subscription grants premium; replay is idempotent', async () => {
  const f = fixture(); await f.run(); await f.run(); assert.equal(f.store.plan, 'premium'); assert.equal(f.store.stripeSubscriptionId, 'sub_1'); assert.equal(f.counts().stopped, 0);
});
