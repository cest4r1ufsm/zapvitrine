// Webhooks are notifications, not an ordered ledger. Always read current Stripe
// state and validate the customer/subscription before changing entitlement.
async function reconcileStripeEvent({ event, stripe, prisma, withStoreLock, stopSession }) {
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) return;
  const object = event.data.object;
  const checkout = event.type.startsWith('checkout.');
  const subscriptionId = checkout ? object.subscription : object.id;
  if (typeof subscriptionId !== 'string') return;
  let store;
  if (checkout) {
    if (object.mode !== 'subscription' || !/^\d+$/.test(object.client_reference_id || '')) return;
    store = await prisma.store.findUnique({ where: { id: Number(object.client_reference_id) } });
  } else store = await prisma.store.findFirst({ where: { stripeSubscriptionId: subscriptionId } });
  if (!store) return;
  await withStoreLock(store.id, async () => {
    const current = await prisma.store.findUnique({ where: { id: store.id } });
    if (!current) return;
    // A late Stripe callback must never disable a Google Play subscription.
    if (current.subscriptionSource === 'play' && current.subscriptionStatus === 'active') return;
    if (current.stripeSubscriptionId && current.stripeSubscriptionId !== subscriptionId) {
      if (!checkout) return;
      const previous = await stripe.subscriptions.retrieve(current.stripeSubscriptionId);
      if (!['canceled', 'incomplete_expired'].includes(previous.status)) return;
    }
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    const expectedCustomer = checkout ? (typeof object.customer === 'string' ? object.customer : object.customer?.id) : current.stripeCustomerId;
    if (!customerId || !expectedCustomer || customerId !== expectedCustomer || current.stripeCustomerId && current.stripeCustomerId !== customerId) return;
    // Trials require an explicit commercial policy; do not promote incomplete,
    // unpaid or canceled subscriptions merely because checkout completed.
    const active = subscription.status === 'active';
    await prisma.store.update({ where: { id: current.id }, data: {
      stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId,
      subscriptionSource: 'stripe', subscriptionStatus: subscription.status,
      plan: active ? 'premium' : 'free',
      ...(!active && { botEnabled: false }),
    } });
    if (!active) await stopSession(current.id);
  });
}
module.exports = { reconcileStripeEvent };
