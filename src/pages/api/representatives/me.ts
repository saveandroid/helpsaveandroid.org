import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getExistingVoterHash } from '@/lib/representatives/cookies';
import { envBindings, json, noStoreHeaders } from '@/lib/representatives/http';
import { getVisitorState } from '@/lib/representatives/db';

export const GET: APIRoute = async ({ request }) => {
  const bindings = envBindings(env);
  const voterHash = await getExistingVoterHash(request, bindings.HSA_COOKIE_SECRET);
  const state = await getVisitorState(bindings, voterHash);

  return json(state, {
    headers: noStoreHeaders(),
  });
};
