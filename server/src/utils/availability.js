const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const DEFAULT_CONFIG = {
  slotInterval: 30,
  hours: {
    monday:    { active: true,  open: '09:00', close: '18:00' },
    tuesday:   { active: true,  open: '09:00', close: '18:00' },
    wednesday: { active: true,  open: '09:00', close: '18:00' },
    thursday:  { active: true,  open: '09:00', close: '18:00' },
    friday:    { active: true,  open: '09:00', close: '18:00' },
    saturday:  { active: true,  open: '09:00', close: '13:00' },
    sunday:    { active: false, open: '09:00', close: '18:00' },
  },
};

function parseConfig(configStr) {
  if (!configStr) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(configStr);
    // Merge with defaults so missing days are always present
    return {
      slotInterval: parsed.slotInterval || DEFAULT_CONFIG.slotInterval,
      hours: { ...DEFAULT_CONFIG.hours, ...parsed.hours },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function generateRawSlots(open, close, duration, interval) {
  const slots = [];
  const openMin  = timeToMinutes(open);
  const closeMin = timeToMinutes(close);
  const step     = Math.max(interval, 1);
  let current    = openMin;
  while (current + duration <= closeMin) {
    slots.push(minutesToTime(current));
    current += step;
  }
  return slots;
}

function isSlotOccupied(slotTime, existingOrders, relevantBlocks, totalDuration) {
  const slotStart = timeToMinutes(slotTime);
  const slotEnd   = slotStart + totalDuration;

  for (const b of relevantBlocks) {
    if (b.isFullDay) return true;
    if (b.startTime && b.endTime) {
      const bStart = timeToMinutes(b.startTime);
      const bEnd   = timeToMinutes(b.endTime);
      if (slotStart < bEnd && slotEnd > bStart) return true;
    }
  }

  for (const order of existingOrders) {
    if (!order.scheduledAt) continue;
    const dt = new Date(order.scheduledAt);
    // scheduledAt is stored as "fake UTC" = BRT local time
    const orderStartMin = dt.getUTCHours() * 60 + dt.getUTCMinutes();
    const orderDur      = (order.product?.duration || 30) + (order.product?.bufferTime || 0);
    const orderEndMin   = orderStartMin + orderDur;
    if (slotStart < orderEndMin && slotEnd > orderStartMin) return true;
  }

  return false;
}

// Returns array of "HH:MM" strings available for booking
async function getAvailableSlots(prisma, storeId, dateStr, serviceId, professionalId) {
  const [store, service] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId } }),
    prisma.product.findUnique({ where: { id: serviceId } }),
  ]);

  if (!store || !service) return [];

  const config    = parseConfig(store.schedulingConfig);
  const dateObj   = new Date(dateStr + 'T12:00:00Z'); // midday to avoid DST edge cases
  const dayName   = DAYS[dateObj.getUTCDay()];
  const dayConfig = config.hours[dayName];

  if (!dayConfig?.active) return [];

  const duration      = (service.duration || 30) + (service.bufferTime || 0);
  const slotInterval  = config.slotInterval || 30;
  const allSlots      = generateRawSlots(dayConfig.open, dayConfig.close, duration, slotInterval);

  if (allSlots.length === 0) return [];

  // Date boundaries (fake-UTC = BRT)
  const dayStart = new Date(dateStr + 'T00:00:00.000Z');
  const dayEnd   = new Date(dateStr + 'T23:59:59.000Z');

  // Blocked slots for this specific date OR recurring weekday
  const allBlocks = await prisma.blockedSlot.findMany({
    where: {
      storeId,
      OR: [
        { date: dateStr,  isRecurring: false },
        { date: dayName,  isRecurring: true  },
      ],
    },
  });

  // Existing confirmed/pending orders with structured scheduledAt on this day
  const existingOrders = await prisma.order.findMany({
    where: {
      storeId,
      scheduledAt: { gte: dayStart, lte: dayEnd },
      status: { notIn: ['cancelled'] },
      ...(professionalId ? { professionalId } : {}),
    },
    include: { product: { select: { duration: true, bufferTime: true } } },
  });

  // Filter blocks relevant to this professional (null = all, or matching id)
  const relevantBlocks = allBlocks.filter(b =>
    b.professionalId === null || b.professionalId === professionalId
  );

  // Full-day block? Return empty immediately
  if (relevantBlocks.some(b => b.isFullDay)) return [];

  // Get Brazil local "now" — server is UTC, BRT = UTC-3
  const nowBRT    = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const todayBRT  = nowBRT.toISOString().slice(0, 10);
  const isToday   = (dateStr === todayBRT);
  const nowMinBRT = isToday ? nowBRT.getUTCHours() * 60 + nowBRT.getUTCMinutes() + 60 : 0; // +60min lead

  return allSlots.filter(slot => {
    if (isToday && timeToMinutes(slot) <= nowMinBRT) return false;
    return !isSlotOccupied(slot, existingOrders, relevantBlocks, duration);
  });
}

// Returns next N days that have at least one available slot
async function getAvailableDates(prisma, storeId, serviceId, professionalId, maxDays = 7) {
  const result  = [];
  const config  = parseConfig(
    (await prisma.store.findUnique({ where: { id: storeId }, select: { schedulingConfig: true } }))?.schedulingConfig
  );

  // Start from tomorrow (BRT)
  const nowBRT  = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const todayBRT = nowBRT.toISOString().slice(0, 10);

  for (let offset = 0; offset <= 30 && result.length < maxDays; offset++) {
    const d = new Date(todayBRT + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + offset);
    const dateStr = d.toISOString().slice(0, 10);
    const dayName = DAYS[d.getUTCDay()];

    if (!config.hours[dayName]?.active) continue;

    const slots = await getAvailableSlots(prisma, storeId, dateStr, serviceId, professionalId);
    if (slots.length > 0) {
      result.push({ date: dateStr, slots });
    }
  }

  return result;
}

// Build a DateTime object from date string + time string (stored as fake-UTC = BRT)
function buildScheduledAt(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00.000Z`);
}

function formatDateBR(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

const DAY_LABELS_BR = {
  monday: 'Seg', tuesday: 'Ter', wednesday: 'Qua',
  thursday: 'Qui', friday: 'Sex', saturday: 'Sáb', sunday: 'Dom',
};

function getDayLabelBR(dateStr) {
  const d    = new Date(dateStr + 'T12:00:00Z');
  const name = DAYS[d.getUTCDay()];
  return DAY_LABELS_BR[name] || name;
}

module.exports = {
  getAvailableSlots,
  getAvailableDates,
  buildScheduledAt,
  parseConfig,
  DEFAULT_CONFIG,
  formatDateBR,
  getDayLabelBR,
  timeToMinutes,
  minutesToTime,
};
