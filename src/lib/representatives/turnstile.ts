export async function validateTurnstile(secret: string | undefined, token: string | undefined, remoteIp?: string): Promise<boolean> {
  if (!token) return false;

  if (!secret) {
    return import.meta.env.DEV && token === 'dev-turnstile-token';
  }

  const form = new FormData();
  form.set('secret', secret);
  form.set('response', token);
  if (remoteIp) form.set('remoteip', remoteIp);

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });

  if (!response.ok) return false;
  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}
