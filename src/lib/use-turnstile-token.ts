import { useCallback, useEffect } from 'react';
import { getTurnstileToken as requestTurnstileToken, preloadTurnstile } from './turnstile-token-broker';

export function useTurnstileToken(siteKey: string) {
  useEffect(() => {
    void preloadTurnstile(siteKey).catch(() => {
      // Token requests surface verification load failures when a user acts.
    });
  }, [siteKey]);

  const getTurnstileToken = useCallback(() => requestTurnstileToken(siteKey), [siteKey]);

  return { getTurnstileToken };
}
