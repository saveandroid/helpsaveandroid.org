import { useCallback, useEffect, useRef } from 'react';

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

export function useTurnstileToken(siteKey: string) {
  const turnstileHostRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetRef = useRef<string | null>(null);
  const turnstileResolverRef = useRef<((token: string) => void) | null>(null);
  const turnstileRejectRef = useRef<((error: Error) => void) | null>(null);

  const getTurnstileToken = useCallback(() => {
    if (!siteKey) {
      if (import.meta.env.DEV) return Promise.resolve('dev-turnstile-token');
      return Promise.reject(new Error('Verification is not configured. Please try again later.'));
    }

    return new Promise<string>((resolve, reject) => {
      const start = Date.now();
      const waitForTurnstile = () => {
        if (!turnstileHostRef.current) {
          reject(new Error('Verification widget is not available.'));
          return;
        }
        if (!window.turnstile) {
          if (Date.now() - start > 8000) {
            reject(new Error('Verification did not load. Please try again.'));
            return;
          }
          window.setTimeout(waitForTurnstile, 120);
          return;
        }

        turnstileResolverRef.current = resolve;
        turnstileRejectRef.current = reject;

        if (!turnstileWidgetRef.current) {
          turnstileWidgetRef.current = window.turnstile.render(turnstileHostRef.current, {
            sitekey: siteKey,
            size: 'normal',
            execution: 'execute',
            appearance: 'execute',
            callback: (token: string) => {
              turnstileResolverRef.current?.(token);
              turnstileResolverRef.current = null;
            },
            'error-callback': () => {
              turnstileRejectRef.current?.(new Error('Verification failed. Please try again.'));
              turnstileRejectRef.current = null;
            },
            'expired-callback': () => {
              turnstileRejectRef.current?.(new Error('Verification expired. Please try again.'));
              turnstileRejectRef.current = null;
            },
          });
        }

        window.turnstile.reset(turnstileWidgetRef.current);
        window.turnstile.execute(turnstileWidgetRef.current);
      };

      waitForTurnstile();
    });
  }, [siteKey]);

  useEffect(() => {
    return () => {
      if (turnstileWidgetRef.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetRef.current);
      }
      turnstileWidgetRef.current = null;
      turnstileResolverRef.current = null;
      turnstileRejectRef.current = null;
    };
  }, []);

  return { turnstileHostRef, getTurnstileToken };
}
