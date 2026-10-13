export function hasPaidAccess(store, now = Date.now()) {
  return store?.subscriptionStatus === 'active' && (store.subscriptionSource !== 'play'
    || Date.parse(store.subscriptionExpiresAt || '') > now);
}

export function hasPremiumAccess(store, now = Date.now()) {
  return hasPaidAccess(store, now) || Date.parse(store?.trialEndsAt || '') > now;
}
