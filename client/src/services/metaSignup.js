const TRUSTED_ORIGINS = new Set(['https://www.facebook.com', 'https://web.facebook.com', 'https://business.facebook.com', 'https://facebook.com']);
let sdkPromise;

export function parseSignupEvent(event) {
  if (!TRUSTED_ORIGINS.has(event.origin)) return null;
  let data;
  try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return null; }
  if (!data || data.type !== 'WA_EMBEDDED_SIGNUP') return null;
  if (data.event === 'CANCEL') return { type: 'cancel' };
  if (data.event === 'ERROR') return { type: 'error' };
  if (!['FINISH', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'].includes(data.event)) return null;
  const wabaId = String(data.data?.waba_id || '');
  const phoneId = String(data.data?.phone_number_id || '');
  if (!/^\d+$/.test(wabaId) || (phoneId && !/^\d+$/.test(phoneId))) return null;
  return { type: 'finish', wabaId, ...(phoneId ? { phoneId } : {}) };
}

export function prepareMetaSdk({ appId, graphVersion }) {
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      if (window.FB) { resolve(window.FB); return; }
      const script = document.createElement('script');
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.async = true;
      script.crossOrigin = 'anonymous';
      const timer = setTimeout(() => { script.remove(); reject(new Error('A Meta demorou para carregar. Verifique sua conexão e tente novamente.')); }, 20000);
      script.onload = () => { clearTimeout(timer); window.FB ? resolve(window.FB) : reject(new Error('Não foi possível carregar a conexão com a Meta.')); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Não foi possível acessar a Meta. Verifique a rede ou o bloqueador de conteúdo.')); };
      document.head.appendChild(script);
    }).catch(error => { sdkPromise = undefined; throw error; });
  }
  return sdkPromise.then(fb => {
    fb.init({ appId, version: graphVersion, autoLogAppEvents: false, xfbml: false });
    return fb;
  });
}

// The SDK must be loaded BEFORE the user gesture: awaiting network here blocks mobile popups.
export function launchMetaSignup({ fb, configId, onComplete, onError, onCancel }) {
  let code;
  let assets;
  let finished = false;
  const cleanup = () => { finished = true; clearTimeout(timer); window.removeEventListener('message', receive); code = null; assets = null; };
  const fail = message => { if (finished) return; cleanup(); onError(new Error(message)); };
  const complete = () => {
    if (finished || !code || !assets) return;
    const payload = { code, ...assets };
    cleanup();
    onComplete(payload);
  };
  const receive = event => {
    if (finished) return;
    const parsed = parseSignupEvent(event);
    if (!parsed) return;
    if (parsed.type === 'cancel') { cleanup(); onCancel(); }
    else if (parsed.type === 'error') fail('A Meta não concluiu a conexão. Confira a elegibilidade do WhatsApp Business e tente novamente.');
    else { assets = { wabaId: parsed.wabaId, ...(parsed.phoneId ? { phoneId: parsed.phoneId } : {}) }; complete(); }
  };
  const timer = setTimeout(() => fail('A confirmação não chegou. Verifique o WhatsApp Business e inicie uma nova tentativa.'), 10 * 60 * 1000);
  window.addEventListener('message', receive);
  try {
    fb.login(response => {
      if (finished) return;
      if (!response.authResponse?.code) { cleanup(); onCancel(); return; }
      code = response.authResponse.code;
      complete();
    }, {
      config_id: configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' },
    });
  } catch { fail('Não foi possível abrir a autorização. Permita a janela da Meta ou tente no Chrome atualizado.'); }
  return cleanup;
}
