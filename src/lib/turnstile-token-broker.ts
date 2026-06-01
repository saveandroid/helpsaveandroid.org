type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_HOST_ID = 'hsa-turnstile-host';
const TURNSTILE_WAIT_TIMEOUT_MS = 8000;
const TURNSTILE_EXECUTE_TIMEOUT_MS = 20000;

let widgetId: string | null = null;
let widgetSiteKey: string | null = null;
let tokenQueue: Promise<void> = Promise.resolve();
let scriptRequested = false;

function verificationUnavailable(): Error {
  return new Error('Verification is not configured. Please try again later.');
}

function ensureScriptRequested() {
  if (scriptRequested || document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)) {
    scriptRequested = true;
    return;
  }

  const script = document.createElement('script');
  script.src = TURNSTILE_SCRIPT_SRC;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
  scriptRequested = true;
}

function ensureHost(): HTMLElement {
  const existing = document.getElementById(TURNSTILE_HOST_ID);
  if (existing) return existing;

  const host = document.createElement('div');
  host.id = TURNSTILE_HOST_ID;
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.left = '0';
  host.style.bottom = '0';
  host.style.width = '1px';
  host.style.height = '1px';
  host.style.overflow = 'hidden';
  document.body.appendChild(host);
  return host;
}

async function waitForTurnstile(): Promise<TurnstileApi> {
  ensureScriptRequested();

  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (window.turnstile) {
        resolve(window.turnstile);
        return;
      }

      if (Date.now() - start > TURNSTILE_WAIT_TIMEOUT_MS) {
        reject(new Error('Verification did not load. Please try again.'));
        return;
      }

      window.setTimeout(check, 120);
    };

    check();
  });
}

async function ensureWidget(siteKey: string): Promise<TurnstileApi> {
  if (!siteKey) throw verificationUnavailable();

  const turnstile = await waitForTurnstile();
  const host = ensureHost();

  if (widgetId && widgetSiteKey !== siteKey) {
    turnstile.remove(widgetId);
    widgetId = null;
    widgetSiteKey = null;
  }

  if (!widgetId) {
    widgetId = turnstile.render(host, {
      sitekey: siteKey,
      size: 'normal',
      execution: 'execute',
      appearance: 'execute',
    });
    widgetSiteKey = siteKey;
  }

  return turnstile;
}

async function executeTurnstile(siteKey: string): Promise<string> {
  if (!siteKey) {
    if (import.meta.env.DEV) return 'dev-turnstile-token';
    throw verificationUnavailable();
  }

  const turnstile = await ensureWidget(siteKey);

  return new Promise((resolve, reject) => {
    if (!widgetId) {
      reject(new Error('Verification widget is not available.'));
      return;
    }

    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Verification timed out. Please try again.'));
    }, TURNSTILE_EXECUTE_TIMEOUT_MS);

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      callback();
    };

    const host = ensureHost();
    turnstile.remove(widgetId);
    widgetId = turnstile.render(host, {
      sitekey: siteKey,
      size: 'normal',
      execution: 'execute',
      appearance: 'execute',
      callback: (token: string) => {
        settle(() => resolve(token));
      },
      'error-callback': () => {
        settle(() => reject(new Error('Verification failed. Please try again.')));
      },
      'expired-callback': () => {
        settle(() => reject(new Error('Verification expired. Please try again.')));
      },
    });
    widgetSiteKey = siteKey;

    turnstile.reset(widgetId);
    turnstile.execute(widgetId);
  });
}

export async function preloadTurnstile(siteKey: string): Promise<void> {
  if (!siteKey) return;
  await ensureWidget(siteKey);
}

export function getTurnstileToken(siteKey: string): Promise<string> {
  const request = tokenQueue.then(() => executeTurnstile(siteKey));
  tokenQueue = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
}
