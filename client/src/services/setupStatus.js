export const SETUP_SEEN_KEY = 'agtgestor_setup_seen';

function parseConfig(store) {
  try { return typeof store?.schedulingConfig === 'string' ? JSON.parse(store.schedulingConfig) : store?.schedulingConfig; } catch { return null; }
}

// Which of the four first-run steps are already done for this salon.
export function setupStatus(store, products) {
  const config = parseConfig(store);
  const hasHours = Object.values(config?.hours || {}).some(day => day?.active && day.open < day.close);
  return {
    salon: Boolean(store?.name && store?.phone),
    hours: hasHours,
    service: products.some(product => product.active),
    whatsapp: store?.officialStatus === 'connected',
  };
}
