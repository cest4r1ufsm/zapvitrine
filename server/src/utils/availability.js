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

const MIN_SLOT_INTERVAL = 5;
const MAX_SLOT_INTERVAL = 240;

// Nomes completos em português — usados nas mensagens de erro de validação
const DAY_NAMES_BR = {
  sunday:    'Domingo',
  monday:    'Segunda-feira',
  tuesday:   'Terça-feira',
  wednesday: 'Quarta-feira',
  thursday:  'Quinta-feira',
  friday:    'Sexta-feira',
  saturday:  'Sábado',
};

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// "HH:MM" 24h válido?
function isValidHHMM(value) {
  return typeof value === 'string' && HHMM_REGEX.test(value.trim());
}

// "AAAA-MM-DD" válido E data real de calendário?
function isValidDateStr(value) {
  if (typeof value !== 'string' || !DATE_REGEX.test(value.trim())) return false;
  const str = value.trim();
  const d = new Date(`${str}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === str;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toIntOrNull(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return parseInt(value.trim(), 10);
  return null;
}

function cloneDefaultConfig() {
  const hours = {};
  for (const day of DAYS) hours[day] = { ...DEFAULT_CONFIG.hours[day] };
  return { slotInterval: DEFAULT_CONFIG.slotInterval, hours };
}

// Tolerante: nunca lança. Faz merge PROFUNDO por dia e sanitiza cada campo.
// Um dia com horários inválidos ou open >= close vira INATIVO em vez de quebrar.
function parseConfig(configStr) {
  let parsed = configStr;

  if (typeof configStr === 'string') {
    if (!configStr.trim()) return cloneDefaultConfig();
    try {
      parsed = JSON.parse(configStr);
    } catch {
      return cloneDefaultConfig();
    }
  }

  if (!isPlainObject(parsed)) return cloneDefaultConfig();

  const interval = toIntOrNull(parsed.slotInterval);
  const slotInterval = (interval !== null && interval >= MIN_SLOT_INTERVAL && interval <= MAX_SLOT_INTERVAL)
    ? interval
    : DEFAULT_CONFIG.slotInterval;

  const rawHours = isPlainObject(parsed.hours) ? parsed.hours : {};
  const hours = {};

  for (const day of DAYS) {
    const def    = DEFAULT_CONFIG.hours[day];
    const raw    = isPlainObject(rawHours[day]) ? rawHours[day] : {};
    const merged = { ...def, ...raw };

    const open   = isValidHHMM(merged.open)  ? merged.open.trim()  : def.open;
    const close  = isValidHHMM(merged.close) ? merged.close.trim() : def.close;

    let active = merged.active === true;
    // Intervalo degenerado (abertura >= fechamento): dia não gera horários
    if (timeToMinutes(open) >= timeToMinutes(close)) active = false;

    hours[day] = { active, open, close };
  }

  return { slotInterval, hours };
}

// Valida e NORMALIZA a config vinda do painel (string JSON ou objeto).
// Retorna { ok: true, value, json } ou { ok: false, error } com mensagem em português.
function validateSchedulingConfig(input) {
  let parsed = input;

  if (typeof input === 'string') {
    if (!input.trim()) return { ok: false, error: 'Configuração de agenda inválida' };
    try {
      parsed = JSON.parse(input);
    } catch {
      return { ok: false, error: 'Configuração de agenda inválida (JSON malformado)' };
    }
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'Configuração de agenda inválida' };
  }

  let slotInterval = DEFAULT_CONFIG.slotInterval;
  if (parsed.slotInterval !== undefined && parsed.slotInterval !== null && parsed.slotInterval !== '') {
    const interval = toIntOrNull(parsed.slotInterval);
    if (interval === null || interval < MIN_SLOT_INTERVAL || interval > MAX_SLOT_INTERVAL) {
      return { ok: false, error: `Intervalo entre horários deve ser um número inteiro entre ${MIN_SLOT_INTERVAL} e ${MAX_SLOT_INTERVAL} minutos` };
    }
    slotInterval = interval;
  }

  if (parsed.hours !== undefined && parsed.hours !== null && !isPlainObject(parsed.hours)) {
    return { ok: false, error: 'Horários de funcionamento inválidos' };
  }

  const rawHours = isPlainObject(parsed.hours) ? parsed.hours : {};
  const hours = {};

  for (const day of DAYS) {
    const def   = DEFAULT_CONFIG.hours[day];
    const label = DAY_NAMES_BR[day];
    const raw   = rawHours[day];

    if (raw !== undefined && raw !== null && !isPlainObject(raw)) {
      return { ok: false, error: `${label}: configuração inválida` };
    }

    const src = isPlainObject(raw) ? raw : {};

    const hasActive = src.active !== undefined && src.active !== null;
    const hasOpen   = src.open   !== undefined && src.open   !== null && src.open   !== '';
    const hasClose  = src.close  !== undefined && src.close  !== null && src.close  !== '';

    // Dia não informado (ou objeto vazio): assume o padrão completo
    if (!hasActive && !hasOpen && !hasClose) {
      hours[day] = { ...def };
      continue;
    }

    let active = def.active;
    if (hasActive) {
      if (typeof src.active !== 'boolean') {
        return { ok: false, error: `${label}: o campo "aberto" deve ser verdadeiro ou falso` };
      }
      active = src.active;
    }

    if (hasOpen && !isValidHHMM(src.open)) {
      return { ok: false, error: `${label}: horário de abertura inválido (use o formato HH:MM)` };
    }
    if (hasClose && !isValidHHMM(src.close)) {
      return { ok: false, error: `${label}: horário de fechamento inválido (use o formato HH:MM)` };
    }

    if (active && (!hasOpen || !hasClose)) {
      return { ok: false, error: `${label}: informe os horários de abertura e fechamento` };
    }

    const open  = hasOpen  ? src.open.trim()  : def.open;
    const close = hasClose ? src.close.trim() : def.close;

    if (active && timeToMinutes(open) >= timeToMinutes(close)) {
      return { ok: false, error: `${label}: horário de abertura deve ser anterior ao de fechamento` };
    }

    hours[day] = { active, open, close };
  }

  const value = { slotInterval, hours };
  return { ok: true, value, json: JSON.stringify(value) };
}

// Retorna minutos desde 00:00, ou null se a entrada não for "HH:MM" (ou "HH:MM:SS") válido
function timeToMinutes(time) {
  if (typeof time !== 'string') return null;
  const match = time.trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
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
  if (openMin === null || closeMin === null) return slots;
  const step     = Math.max(interval, 1);
  let current    = openMin;
  while (current + duration <= closeMin) {
    slots.push(minutesToTime(current));
    current += step;
  }
  return slots;
}

// Descarta (com aviso) bloqueios não-fullDay com horários ausentes/inválidos.
// Registros assim existem em produção (criados antes da validação do POST).
function sanitizeBlocks(blocks) {
  return blocks.filter(b => {
    if (b.isFullDay) return true;
    if (timeToMinutes(b.startTime) === null || timeToMinutes(b.endTime) === null) {
      console.warn(`[availability] Bloqueio #${b.id} ignorado: horários inválidos (startTime=${b.startTime}, endTime=${b.endTime})`);
      return false;
    }
    return true;
  });
}

function isSlotOccupied(slotTime, existingOrders, relevantBlocks, totalDuration) {
  const slotStart = timeToMinutes(slotTime);
  if (slotStart === null) return true;
  const slotEnd = slotStart + totalDuration;

  for (const b of relevantBlocks) {
    if (b.isFullDay) return true;
    const bStart = timeToMinutes(b.startTime);
    const bEnd   = timeToMinutes(b.endTime);
    if (bStart === null || bEnd === null) {
      console.warn(`[availability] Bloqueio #${b.id} ignorado: horários inválidos (startTime=${b.startTime}, endTime=${b.endTime})`);
      continue;
    }
    if (slotStart < bEnd && slotEnd > bStart) return true;
  }

  for (const order of existingOrders) {
    if (!order.scheduledAt) continue;
    const dt = new Date(order.scheduledAt);
    // scheduledAt is stored as "fake UTC" = BRT local time
    const orderStartMin = dt.getUTCHours() * 60 + dt.getUTCMinutes();
    // durationOverride: tempo personalizado definido para ESTE atendimento
    // (o profissional julgou precisar de mais/menos tempo que o padrão do serviço)
    const base          = Number.isInteger(order.durationOverride) && order.durationOverride > 0
      ? order.durationOverride
      : (order.product?.duration || 30);
    const orderDur      = base + (order.product?.bufferTime || 0);
    const orderEndMin   = orderStartMin + orderDur;
    if (slotStart < orderEndMin && slotEnd > orderStartMin) return true;
  }

  return false;
}

// Returns array of "HH:MM" strings available for booking
// `durationOverride` (minutos) permite procurar espaço para um atendimento mais
// longo — ou mais curto — que o padrão do serviço, sem alterar o cadastro dele.
async function getAvailableSlots(prisma, storeId, dateStr, serviceId, professionalId, durationOverride = null) {
  if (!Number.isInteger(storeId) || !Number.isInteger(serviceId)) return [];
  if (!isValidDateStr(dateStr)) return [];

  // NaN/garbage vira null ("qualquer profissional") em vez de quebrar a query
  const profId = Number.isInteger(professionalId) ? professionalId : null;

  const [store, service] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId } }),
    // findFirst com storeId: impede calcular slots com a duração de um produto de outra loja
    prisma.product.findFirst({ where: { id: serviceId, storeId } }),
  ]);

  if (!store || !service) return [];

  const config    = parseConfig(store.schedulingConfig);
  const dateObj   = new Date(dateStr + 'T12:00:00Z'); // midday to avoid DST edge cases
  const dayName   = DAYS[dateObj.getUTCDay()];
  const dayConfig = config.hours[dayName];

  if (!dayConfig?.active) return [];

  const base          = Number.isInteger(durationOverride) && durationOverride > 0
    ? durationOverride
    : (service.duration || 30);
  // O intervalo do serviço continua valendo: é o descanso entre atendimentos
  const duration      = base + (service.bufferTime || 0);
  const slotInterval  = config.slotInterval || 30;
  const allSlots      = generateRawSlots(dayConfig.open, dayConfig.close, duration, slotInterval);

  if (allSlots.length === 0) return [];

  // Date boundaries (fake-UTC = BRT)
  const dayStart = new Date(dateStr + 'T00:00:00.000Z');
  const dayEnd   = new Date(dateStr + 'T23:59:59.000Z');

  // Blocked slots for this specific date OR recurring weekday
  const allBlocks = sanitizeBlocks(await prisma.blockedSlot.findMany({
    where: {
      storeId,
      OR: [
        { date: dateStr,  isRecurring: false },
        { date: dayName,  isRecurring: true  },
      ],
    },
  }));

  // Existing confirmed/pending orders with structured scheduledAt on this day (toda a loja;
  // a separação por profissional é feita em memória logo abaixo)
  const dayOrders = await prisma.order.findMany({
    where: {
      storeId,
      scheduledAt: { gte: dayStart, lte: dayEnd },
      status: { notIn: ['cancelled'] },
    },
    include: { product: { select: { duration: true, bufferTime: true } } },
  });

  const globalBlocks = allBlocks.filter(b => b.professionalId === null);
  // Pedidos legados (sem profissional) ocupam qualquer recurso
  const legacyOrders = dayOrders.filter(o => o.professionalId === null);

  // Cada "recurso" é um candidato capaz de atender o slot.
  // O slot está livre se PELO MENOS UM recurso estiver livre.
  let resources;

  if (profId !== null) {
    // O profissional precisa existir, ser DESTA loja e estar ativo. Sem esta
    // checagem, pedir horários para um profissional desativado (ou inexistente,
    // ou de outra loja) devolvia a grade inteira, e o agendamento resultante
    // ficava invisível para o modelo de recursos — ou seja, não ocupava nada.
    const professional = await prisma.professional.findFirst({
      where: { id: profId, storeId, active: true },
      select: { id: true },
    });
    if (!professional) return [];

    resources = [{
      blocks: allBlocks.filter(b => b.professionalId === null || b.professionalId === profId),
      orders: dayOrders.filter(o => o.professionalId === profId || o.professionalId === null),
    }];
  } else {
    const professionals = await prisma.professional.findMany({
      where: { storeId, active: true },
      select: { id: true },
    });

    if (professionals.length === 0) {
      // Loja sem equipe = recurso único: qualquer pedido ocupa o horário
      resources = [{ blocks: globalBlocks, orders: dayOrders }];
    } else {
      resources = professionals.map(p => ({
        blocks: globalBlocks.concat(allBlocks.filter(b => b.professionalId === p.id)),
        orders: legacyOrders.concat(dayOrders.filter(o => o.professionalId === p.id)),
      }));
    }
  }

  // Todos os recursos bloqueados o dia inteiro? Retorna vazio imediatamente
  if (resources.every(r => r.blocks.some(b => b.isFullDay))) return [];

  // Get Brazil local "now" — server is UTC, BRT = UTC-3
  const nowBRT    = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const todayBRT  = nowBRT.toISOString().slice(0, 10);
  const isToday   = (dateStr === todayBRT);
  const nowMinBRT = isToday ? nowBRT.getUTCHours() * 60 + nowBRT.getUTCMinutes() + 60 : 0; // +60min lead

  return allSlots.filter(slot => {
    if (isToday && timeToMinutes(slot) <= nowMinBRT) return false;
    return resources.some(r => !isSlotOccupied(slot, r.orders, r.blocks, duration));
  });
}

// Returns next N days that have at least one available slot
async function getAvailableDates(prisma, storeId, serviceId, professionalId, maxDays = 7) {
  const result  = [];
  const limit   = Math.min(Math.max(toIntOrNull(maxDays) ?? 7, 1), 60);
  const config  = parseConfig(
    (await prisma.store.findUnique({ where: { id: storeId }, select: { schedulingConfig: true } }))?.schedulingConfig
  );

  // Start from today (BRT) — no máximo 31 dias à frente (offsets 0..30)
  const nowBRT  = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const todayBRT = nowBRT.toISOString().slice(0, 10);

  for (let offset = 0; offset <= 30 && result.length < limit; offset++) {
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
  // Adicionados — reutilizados por store.js / blocked-slots.js / orders.js
  validateSchedulingConfig,
  isValidHHMM,
  isValidDateStr,
  DAYS,
  DAY_NAMES_BR,
};
