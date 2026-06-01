import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { envBindings, json, noStoreHeaders } from '@/lib/representatives/http';

export const GET: APIRoute = async () => {
  const bindings = envBindings(env);

  return json(
    {
      publicKey: bindings.HSA_WEB_PUSH_PUBLIC_KEY ?? null,
    },
    { headers: noStoreHeaders() },
  );
};
