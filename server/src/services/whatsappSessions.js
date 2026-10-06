// Lifecycle separado do bot para testar pareamento sem rede, contas ou credenciais reais.
// O Baileys fecha o socket quando acabam as referências de QR (~160 s após o primeiro QR).
// O prazo exibido termina antes disso para não mostrar um código que já morreu.
const PAIRING_TTL_MS = 150 * 1000; // Prazo de exibição do app, não garantia de validade no WhatsApp.
const CONNECTION_TIMEOUT_MS = 120000;
const RECONNECT_DELAY_MS = 5000;
const PAIRING_COOLDOWN_MS = 15000;
// Versão antiga é recusada pelo WhatsApp (405). O serviço real busca a mais nova.
const FALLBACK_WA_VERSION = [2, 3000, 1043857760];
// O pedido de código envia `companion_platform_display` = "<browser[1]> (<browser[0]>)".
// O WhatsApp recusa nomes fora dos canônicos (ex.: "Chrome (AGTgestor)") e o celular mostra
// "Não foi possível conectar o aparelho". Mesmo valor de Browsers.macOS('Chrome') do Baileys.
const DEFAULT_BROWSER = Object.freeze(['Mac OS', 'Chrome', '14.4.1']);

// DDDs brasileiros válidos.
const BR_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

function requestError(message, code) {
  return Object.assign(new Error(message), { code, status: 400 });
}

// O código só funciona com o número exato da conta no WhatsApp. No Brasil, contas de
// DDD 31 em diante costumam estar registradas sem o 9 extra (12 dígitos); DDD 11 a 28
// costumam ter o 9 (13 dígitos). Devolve a forma padrão e a outra forma (com/sem o 9).
// `exact` usa o número como veio (tentativa com a forma alternativa).
function normalizePhone(raw, exact = false) {
  const plus = raw.trim().startsWith('+');
  let digits = raw.replace(/\D/g, '');
  // Sem "+": 10 ou 11 dígitos com DDD válido é número brasileiro digitado sem o 55.
  if (!plus && BR_DDDS.has(Number(digits.slice(0, 2))) &&
      (digits.length === 10 || (digits.length === 11 && digits[2] === '9'))) {
    digits = '55' + digits;
  }
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  let alternate = null;
  const ddd = Number(digits.slice(2, 4));
  if (digits.startsWith('55') && BR_DDDS.has(ddd)) {
    const withNine = digits.length === 13 && digits[4] === '9' && /[6-9]/.test(digits[5]);
    const withoutNine = digits.length === 12 && /[6-9]/.test(digits[4]);
    if (withNine || withoutNine) {
      const long = withNine ? digits : digits.slice(0, 4) + '9' + digits.slice(4);
      const short = withNine ? digits.slice(0, 4) + digits.slice(5) : digits;
      if (!exact) digits = ddd <= 28 ? long : short;
      alternate = digits === long ? short : long;
    }
  }
  return { phoneNumber: digits, alternatePhoneNumber: alternate };
}

function normalizeConnectOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw requestError('Informe uma opção de conexão válida.', 'INVALID_CONNECTION_METHOD');
  }
  const method = options.method === undefined ? 'qr' : options.method;
  if (!['qr', 'pairing'].includes(method)) {
    throw requestError('Escolha conectar por código ou por QR Code.', 'INVALID_CONNECTION_METHOD');
  }
  for (const key of ['restart', 'exact']) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') {
      throw requestError('Informe uma opção de conexão válida.', 'INVALID_CONNECTION_OPTIONS');
    }
  }
  const restart = options.restart === true;
  if (method === 'qr') return { method, phoneNumber: null, alternatePhoneNumber: null, exact: false, restart };
  if (typeof options.phoneNumber !== 'string' || !/^\+?[\d\s().-]+$/.test(options.phoneNumber.trim())) {
    throw requestError('Informe o WhatsApp com DDD, por exemplo 11 91234-5678.', 'INVALID_PHONE_NUMBER');
  }
  const exact = options.exact === true;
  const phone = normalizePhone(options.phoneNumber, exact);
  if (!phone) {
    throw requestError('Informe um número válido com DDD, por exemplo 11 91234-5678.', 'INVALID_PHONE_NUMBER');
  }
  return { method, ...phone, exact, restart };
}

// Baileys 6.7.16 preenche `me` ANTES de concluir requestPairingCode (com registered=false).
// Login concluído: o QR grava a identidade assinada `account`; o código por número também
// grava `account` e, no companion_finish, define `creds.registered = true`.
function hasAuthenticatedCreds(creds) {
  return !!(creds?.me?.id && (creds.account || creds.registered === true));
}

function createWhatsAppSessions({
  prisma, isEligible, loadAuth, removeAuth, makeSocket, renderQr, disconnectReason,
  onMessage, logger, getVersion = async () => FALLBACK_WA_VERSION, now = Date.now, schedule = setTimeout, cancel = clearTimeout,
  browser = DEFAULT_BROWSER,
}) {
  const sessions = new Map();
  const operations = new Map();

  // Inclui leitura de auth e criação de socket: dois /connect simultâneos nunca
  // carregam/escrevem o mesmo diretório nem criam dois sockets para a mesma loja.
  function serialize(storeId, operation) {
    const previous = operations.get(storeId) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    operations.set(storeId, current);
    current.finally(() => {
      if (operations.get(storeId) === current) operations.delete(storeId);
    }).catch(() => {});
    return current;
  }

  const isCurrent = (session) => sessions.get(session.storeId) === session && !session.disposed;
  const isLive = (session) => isCurrent(session) && !session.closed;
  function timer(fn, delay) {
    const handle = schedule(fn, delay);
    handle?.unref?.();
    return handle;
  }
  function clearTimer(session, key) {
    if (session[key] !== null) cancel(session[key]);
    session[key] = null;
  }
  function clearSecrets(session) {
    session.qrGeneration++;
    session.qrBase64 = null;
    session.pairingCode = null;
    session.pairingExpiresAt = null;
    clearTimer(session, 'pairingTimer');
  }
  function detach(session) {
    if (!session.socket || !session.handlers) return;
    for (const [event, handler] of Object.entries(session.handlers)) {
      session.socket.ev.off(event, handler);
    }
  }
  function endSocket(session) {
    session.closed = true;
    detach(session);
    try { session.socket?.end(new Error('Sessão encerrada pelo aplicativo')); } catch { /* já encerrada */ }
  }
  function fail(session, code, message) {
    if (!isCurrent(session)) return;
    clearSecrets(session);
    clearTimer(session, 'connectionTimer');
    clearTimer(session, 'reconnectTimer');
    session.status = 'error';
    session.errorCode = code;
    session.error = message;
    endSocket(session);
  }

  function getSessionStatus(storeId) {
    const session = sessions.get(storeId);
    if (!session) return { status: 'disconnected', method: null, qr: null, pairingCode: null, pairingExpiresAt: null, pairingPhone: null, alternatePhoneNumber: null, phone: null, error: null, errorCode: null };
    if (session.pairingExpiresAt && now() >= session.pairingExpiresAt) {
      fail(session, 'PAIRING_EXPIRED', 'O código expirou no aplicativo. Gere um novo código para tentar novamente.');
    }
    return {
      status: session.status,
      method: session.method,
      qr: session.qrBase64 || null,
      pairingCode: session.pairingCode || null,
      pairingExpiresAt: session.pairingExpiresAt ? new Date(session.pairingExpiresAt).toISOString() : null,
      // Número para o qual o código foi gerado e a outra forma (com/sem o 9), só com código ativo.
      pairingPhone: session.pairingCode ? session.phoneNumber : null,
      alternatePhoneNumber: session.pairingCode ? (session.alternatePhoneNumber || null) : null,
      phone: session.status === 'connected' ? (session.phone || null) : null,
      error: session.error || null,
      errorCode: session.errorCode || null,
    };
  }

  async function dispose(session, logout = false) {
    session.disposed = true; // Antes de logout/end, que podem emitir close sincronamente.
    clearSecrets(session);
    for (const key of ['connectionTimer', 'reconnectTimer']) clearTimer(session, key);
    detach(session);
    try {
      if (logout && session.socket && !session.closed) await session.socket.logout();
    } catch { /* Mesmo offline, desconectar deve limpar a sessão local. */ }
    endSocket(session);
    await session.savePromise.catch(() => {});
  }

  async function pair(session) {
    if (!isLive(session) || session.pairingRequested || hasAuthenticatedCreds(session.state.creds)) return;
    session.pairingRequested = true;
    try {
      const code = await session.socket.requestPairingCode(session.phoneNumber);
      if (!isLive(session) || session.status === 'connected' || session.authenticated) return;
      if (typeof code !== 'string' || !/^[A-Z0-9]{8}$/i.test(code)) {
        fail(session, 'PAIRING_FAILED', 'Não foi possível gerar um código. Tente novamente.');
        return;
      }
      clearTimer(session, 'connectionTimer');
      session.pairingCode = code.toUpperCase();
      session.pairingExpiresAt = now() + PAIRING_TTL_MS;
      session.status = 'pairing';
      session.pairingTimer = timer(() => {
        fail(session, 'PAIRING_EXPIRED', 'O código expirou no aplicativo. Gere um novo código para tentar novamente.');
      }, PAIRING_TTL_MS);
    } catch {
      // Erros da biblioteca podem carregar número, código e conteúdo de protocolo.
      if (isLive(session)) fail(session, 'PAIRING_FAILED', 'Não foi possível gerar o código. Confira o número e tente novamente.');
    }
  }

  async function connectLocked(storeId, options, previous = null) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store || !isEligible(store)) {
      throw Object.assign(new Error('Assinatura necessária para conectar o WhatsApp.'), { code: 'SUBSCRIPTION_REQUIRED', status: 403 });
    }
    const existing = sessions.get(storeId);
    if (!previous && existing) {
      getSessionStatus(storeId); // Aplica expiração inclusive se o timer tiver atrasado.
      if (existing.status === 'connected') return getSessionStatus(storeId);
      if (['connecting', 'qr', 'pairing', 'reconnecting'].includes(existing.status) &&
          (hasAuthenticatedCreds(existing.state?.creds) ||
           (!options.restart && existing.method === options.method && existing.phoneNumber === options.phoneNumber))) {
        return getSessionStatus(storeId);
      }
      // Trocar para a outra forma do mesmo número (com/sem o 9) logo após o WhatsApp
      // recusar o código não espera o cooldown; só uma vez seguida, para não alternar sem fim.
      const alternateRetry = options.method === 'pairing' && options.exact && existing.method === 'pairing' &&
        !existing.alternateRetry && !!existing.alternatePhoneNumber && options.phoneNumber === existing.alternatePhoneNumber;
      if (alternateRetry) options = { ...options, alternateRetry: true };
      else if (options.method === 'pairing' && now() - existing.createdAt < PAIRING_COOLDOWN_MS) {
        throw Object.assign(new Error('Aguarde 15 segundos antes de gerar outro código.'), { code: 'CONNECTION_COOLDOWN', status: 429 });
      }
    }
    if (previous && existing !== previous) return getSessionStatus(storeId);
    if (existing) await dispose(existing);

    const { state, saveCreds } = await loadAuth(storeId);
    // Tentativas interrompidas podem ter `me` e pairingCode sem uma conta ligada.
    // Só o connect explícito reinicia essas credenciais; reconexão preserva o login.
    let auth = { state, saveCreds };
    if (!previous && !hasAuthenticatedCreds(state.creds) && (existing || state.creds.me || state.creds.pairingCode)) {
      await removeAuth(storeId);
      auth = await loadAuth(storeId);
    }
    const session = {
      storeId, ...options, createdAt: now(), state: auth.state, socket: null, disposed: false, closed: false,
      status: previous ? 'reconnecting' : 'connecting',
      phone: null, error: null, errorCode: null, qrBase64: null, qrGeneration: 0,
      pairingCode: null, pairingExpiresAt: null, pairingRequested: false,
      authenticated: hasAuthenticatedCreds(auth.state.creds),
      retries: previous ? previous.retries : 0,
      pairingTimer: null, connectionTimer: null, reconnectTimer: null,
      savePromise: Promise.resolve(), handlers: null,
    };
    sessions.set(storeId, session);
    try {
      const version = await getVersion();
      if (!isCurrent(session)) return getSessionStatus(storeId);
      const socket = makeSocket({
        auth: auth.state, printQRInTerminal: false, logger,
        version, browser: [...browser],
        connectTimeoutMs: CONNECTION_TIMEOUT_MS, defaultQueryTimeoutMs: 60000, markOnlineOnConnect: false,
      });
      session.socket = socket;
      session.connectionTimer = timer(() => {
        fail(session, 'CONNECTION_TIMEOUT', 'A conexão demorou mais que o esperado. Tente novamente.');
      }, CONNECTION_TIMEOUT_MS);

      const onUpdate = async (update) => {
        if (!isLive(session)) return;
        if (update.isNewLogin) {
          session.authenticated = true;
          clearSecrets(session);
          session.status = 'connecting';
          clearTimer(session, 'connectionTimer');
          session.connectionTimer = timer(() => {
            fail(session, 'CONNECTION_TIMEOUT', 'A conexão demorou mais que o esperado. Tente novamente.');
          }, CONNECTION_TIMEOUT_MS);
        }
        if (update.connection === 'open') {
          clearSecrets(session);
          clearTimer(session, 'connectionTimer');
          session.authenticated = true;
          const storeNow = await prisma.store.findUnique({ where: { id: storeId } });
          if (!isLive(session)) return;
          if (!storeNow || !isEligible(storeNow)) {
            fail(session, 'SUBSCRIPTION_REQUIRED', 'Assinatura necessária para conectar o WhatsApp.');
            return;
          }
          session.status = 'connected';
          session.retries = 0;
          session.phone = (socket.user?.id || '').split('@')[0].split(':')[0];
          // Serializado com disconnect: não reativar bot após uma desconexão explícita.
          await serialize(storeId, async () => {
            if (isLive(session) && session.status === 'connected') {
              await prisma.store.update({ where: { id: storeId }, data: { botEnabled: true } });
            }
          });
          return;
        }
        if (update.connection === 'close') {
          const hadPairingCode = !!session.pairingCode;
          clearSecrets(session);
          clearTimer(session, 'connectionTimer');
          session.closed = true;
          detach(session);
          const statusCode = update.lastDisconnect?.error?.output?.statusCode;
          if (statusCode === disconnectReason.loggedOut) {
            fail(session, 'LOGGED_OUT', 'O WhatsApp foi desconectado. Conecte novamente pelo painel.');
            await serialize(storeId, async () => {
              if (!isCurrent(session)) return;
              await session.savePromise.catch(() => {});
              await removeAuth(storeId);
              await prisma.store.update({ where: { id: storeId }, data: { botEnabled: false } });
            });
            return;
          }
          // Nunca gerar outro código silenciosamente. Após pair-success/restartRequired
          // as credenciais autenticadas são reutilizadas e não pedimos novo pareamento.
          if (session.pairingRequested && !session.authenticated && !hasAuthenticatedCreds(session.state.creds)) {
            // Fim das referências de QR (timedOut): o código deixou de valer no WhatsApp.
            if (hadPairingCode && statusCode === disconnectReason.timedOut) {
              fail(session, 'PAIRING_EXPIRED', 'O código expirou. Gere um novo código para tentar novamente.');
              return;
            }
            fail(session, 'PAIRING_INTERRUPTED', 'A conexão foi interrompida. Gere um novo código para tentar novamente.');
            return;
          }
          if (session.retries >= 3) {
            fail(session, 'CONNECTION_FAILED', 'Não foi possível reconectar. Tente novamente pelo painel.');
            return;
          }
          session.retries++;
          session.status = 'reconnecting';
          session.reconnectTimer = timer(() => {
            session.reconnectTimer = null;
            if (!isCurrent(session)) return;
            serialize(storeId, async () => {
              if (!isCurrent(session)) return;
              try { await connectLocked(storeId, {
                method: session.method, phoneNumber: session.phoneNumber,
                alternatePhoneNumber: session.alternatePhoneNumber, exact: session.exact,
              }, session); }
              catch (error) {
                const current = sessions.get(storeId);
                if (current) fail(current, error.code === 'SUBSCRIPTION_REQUIRED' ? error.code : 'CONNECTION_FAILED',
                  error.code === 'SUBSCRIPTION_REQUIRED' ? 'Assinatura necessária para conectar o WhatsApp.' : 'Não foi possível reconectar. Tente novamente.');
              }
            }).catch(() => {});
          }, RECONNECT_DELAY_MS);
          return;
        }
        if (update.qr && !session.authenticated && session.status !== 'connected') {
          if (session.method === 'pairing') {
            // O evento QR chega após o handshake; connection:'connecting' é cedo
            // demais no Baileys 6.7.16 e pode causar "Connection Closed".
            await pair(session);
          } else {
            const generation = ++session.qrGeneration;
            const qr = await renderQr(update.qr, { width: 300, margin: 2 });
            if (!isLive(session) || generation !== session.qrGeneration || session.authenticated) return;
            clearTimer(session, 'connectionTimer');
            session.qrBase64 = qr;
            session.status = 'qr';
          }
        }
      };
      session.handlers = {
        'connection.update': (update) => onUpdate(update).catch(() => {
          if (isLive(session)) fail(session, 'CONNECTION_FAILED', 'Não foi possível concluir a conexão. Tente novamente.');
        }),
        'creds.update': (update) => {
          if (!isLive(session)) return;
          Object.assign(session.state.creds, update);
          session.authenticated ||= hasAuthenticatedCreds(session.state.creds);
          session.savePromise = session.savePromise.then(() => {
            if (!session.disposed) return auth.saveCreds();
          });
          session.savePromise.catch(() => {
            if (isLive(session)) fail(session, 'SESSION_SAVE_FAILED', 'Não foi possível salvar a conexão. Tente novamente.');
          });
        },
        'messages.upsert': async ({ messages = [] }) => {
          if (!isLive(session) || session.status !== 'connected') return;
          for (const msg of messages) {
            if (!isLive(session)) return;
            if (msg.key?.fromMe || !msg.message) continue;
            const from = msg.key?.remoteJid;
            if (!from || from.endsWith('@g.us')) continue;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text ||
              msg.message.buttonsResponseMessage?.selectedDisplayText || msg.message.listResponseMessage?.title || '';
            if (text.trim()) await onMessage(storeId, socket, from, text.trim(), msg);
          }
        },
      };
      for (const [event, handler] of Object.entries(session.handlers)) socket.ev.on(event, handler);
      return getSessionStatus(storeId);
    } catch {
      fail(session, 'CONNECTION_FAILED', 'Não foi possível iniciar a conexão. Tente novamente.');
      throw Object.assign(new Error('Não foi possível iniciar a conexão WhatsApp.'), { code: 'CONNECTION_FAILED', status: 503 });
    }
  }

  function startSession(storeId, options = {}) {
    const normalized = normalizeConnectOptions(options); // Antes de qualquer leitura/escrita.
    return serialize(storeId, () => connectLocked(storeId, normalized));
  }
  function stopSession(storeId) {
    // Interrompe callbacks/timers já na chamada, inclusive durante um /connect em voo.
    const existing = sessions.get(storeId);
    if (existing) {
      existing.disposed = true;
      clearSecrets(existing);
      for (const key of ['connectionTimer', 'reconnectTimer']) clearTimer(existing, key);
      detach(existing);
    }
    return serialize(storeId, async () => {
      const current = sessions.get(storeId);
      if (current) await dispose(current, true);
      sessions.delete(storeId);
      await removeAuth(storeId);
      await prisma.store.update({ where: { id: storeId }, data: { botEnabled: false } });
    });
  }
  return { startSession, stopSession, getSessionStatus, sessions };
}

module.exports = {
  createWhatsAppSessions, normalizeConnectOptions, hasAuthenticatedCreds,
  PAIRING_TTL_MS, PAIRING_COOLDOWN_MS, FALLBACK_WA_VERSION, DEFAULT_BROWSER,
};
