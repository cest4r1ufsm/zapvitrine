let sdkPromise;

// Only Meta's own HTTPS pages (www., m., web., business. ...) may report the result.
function trustedOrigin(origin) {
  try { const url = new URL(origin); return url.protocol === 'https:' && !url.port && (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com')); }
  catch { return false; }
}

export function parseSignupEvent(event) {
  if (!trustedOrigin(event.origin)) return null;
  let data;
  try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return null; }
  if (!data || data.type !== 'WA_EMBEDDED_SIGNUP') return null;
  // Meta reports on-screen errors as CANCEL with error_message; show the real reason.
  if (data.event === 'CANCEL' && data.data?.error_message) return { type: 'error', message: String(data.data.error_message).slice(0, 300), sessionId: String(data.data.session_id || '').slice(0, 80) };
  if (data.event === 'CANCEL') return { type: 'cancel' };
  if (data.event === 'ERROR') return { type: 'error' };
  if (data.event === 'FINISH_ONLY_WABA') return { type: 'error', message: 'Faltou escolher o número do WhatsApp. Tente de novo e escolha o número do salão.' };
  if (!['FINISH', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'].includes(data.event)) return null;
  const wabaId = String(data.data?.waba_id || '');
  const phoneId = String(data.data?.phone_number_id || '');
  if (!/^\d+$/.test(wabaId) || (phoneId && !/^\d+$/.test(phoneId))) return null;
  return { type: 'finish', wabaId, ...(phoneId ? { phoneId } : {}), onboarding: data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' ? 'business_app' : 'cloud_api' };
}

// sdk.js first defines a temporary window.FB and then swaps in the real SDK.
// Only fbAsyncInit guarantees the real one; a reference taken on script load
// can be the temporary object, whose login() silently does nothing.
export function prepareMetaSdk({ appId, graphVersion }) {
  const init = fb => { fb.init({ appId, version: graphVersion, autoLogAppEvents: false, xfbml: false }); return fb; };
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      if (window.FB?.init && window.__agtMetaSdkReady) { resolve(window.FB); return; }
      const timer = setTimeout(() => { reject(new Error('A Meta demorou para carregar. Verifique sua conexão e tente novamente.')); }, 20000);
      window.fbAsyncInit = () => { clearTimeout(timer); window.__agtMetaSdkReady = true; resolve(init(window.FB)); };
      if (document.querySelector('script[data-agt-meta-sdk]')) return;
      const script = document.createElement('script');
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.agtMetaSdk = 'true';
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Não foi possível acessar a Meta. Verifique a rede ou o bloqueador de conteúdo.')); };
      document.head.appendChild(script);
    }).catch(error => { sdkPromise = undefined; throw error; });
  }
  return sdkPromise.then(() => init(window.FB));
}

// The SDK must be loaded BEFORE the user gesture: awaiting network here blocks mobile popups.
export function launchMetaSignup({ fb, configId, onComplete, onError, onCancel, businessApp = true }) {
  let code;
  let assets;
  let finished = false;
  let codeOnlyTimer;
  const cleanup = () => { finished = true; clearTimeout(timer); clearTimeout(codeOnlyTimer); window.removeEventListener('message', receive); code = null; assets = null; };
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
    else if (parsed.type === 'error') fail(parsed.message ? `A Meta informou: ${parsed.message}${parsed.sessionId ? ` (sessão ${parsed.sessionId})` : ''}` : 'A Meta não concluiu a conexão. Confira o WhatsApp Business e tente novamente.');
    else { assets = { wabaId: parsed.wabaId, onboarding: parsed.onboarding, ...(parsed.phoneId ? { phoneId: parsed.phoneId } : {}) }; complete(); }
  };
  const timer = setTimeout(() => fail('A confirmação não chegou. Verifique o WhatsApp Business e inicie uma nova tentativa.'), 10 * 60 * 1000);
  window.addEventListener('message', receive);
  try {
    // Always call the live SDK object; see prepareMetaSdk.
    const sdk = window.__agtMetaSdkReady && window.FB?.login ? window.FB : fb;
    sdk.login(response => {
      if (finished) return;
      if (!response.authResponse?.code) { cleanup(); onCancel(); return; }
      code = response.authResponse.code;
      complete();
      // Some mobile browsers lose the session message; the server can find the account from the code alone.
      if (!finished) codeOnlyTimer = setTimeout(() => { if (finished || !code) return; const payload = { code, onboarding: businessApp ? 'business_app' : 'cloud_api' }; cleanup(); onComplete(payload); }, 8000);
    }, {
      config_id: configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, ...(businessApp ? { featureType: 'whatsapp_business_app_onboarding' } : {}), sessionInfoVersion: '3' },
    });
  } catch { fail('Não foi possível abrir a autorização. Permita a janela da Meta ou tente no Chrome atualizado.'); }
  return cleanup;
}
