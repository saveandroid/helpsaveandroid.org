import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isValidQid } from '@/data/representatives';
import { getOrCreateVoterHash } from '@/lib/representatives/cookies';
import { candidateExists, clearStar, isBlocked, replaceStar } from '@/lib/representatives/db';
import { envBindings, json, noStoreHeaders, readJsonBody } from '@/lib/representatives/http';
import { validateTurnstile } from '@/lib/representatives/turnstile';

type StarBody = {
  qid?: unknown;
  turnstileToken?: unknown;
};

export const PUT: APIRoute = async ({ request }) => {
  const body = await readJsonBody<StarBody>(request);
  const qid = typeof body?.qid === 'string' ? body.qid : '';
  const turnstileToken = typeof body?.turnstileToken === 'string' ? body.turnstileToken : '';
  const bindings = envBindings(env);

  const turnstileOk = await validateTurnstile(bindings.TURNSTILE_SECRET_KEY, turnstileToken, request.headers.get('CF-Connecting-IP') ?? undefined);
  if (!turnstileOk) return json({ error: 'turnstile_failed' }, { status: 403, headers: noStoreHeaders() });
  if (!isValidQid(qid)) return json({ error: 'invalid_qid' }, { status: 400, headers: noStoreHeaders() });
  if (await isBlocked(bindings, qid)) return json({ error: 'blocked_qid' }, { status: 403, headers: noStoreHeaders() });
  if (!(await candidateExists(bindings.HSA_VOTES_DB, qid))) return json({ error: 'unknown_candidate' }, { status: 404, headers: noStoreHeaders() });

  const voter = await getOrCreateVoterHash(request, bindings.HSA_COOKIE_SECRET);
  const result = await replaceStar(bindings.HSA_VOTES_DB, qid, voter.voterHash);

  return json({ qid, starredQid: qid, ...result }, { headers: noStoreHeaders() }, voter.setCookie);
};

export const DELETE: APIRoute = async ({ request }) => {
  const body = await readJsonBody<StarBody>(request);
  const turnstileToken = typeof body?.turnstileToken === 'string' ? body.turnstileToken : '';
  const bindings = envBindings(env);

  const turnstileOk = await validateTurnstile(bindings.TURNSTILE_SECRET_KEY, turnstileToken, request.headers.get('CF-Connecting-IP') ?? undefined);
  if (!turnstileOk) return json({ error: 'turnstile_failed' }, { status: 403, headers: noStoreHeaders() });

  const voter = await getOrCreateVoterHash(request, bindings.HSA_COOKIE_SECRET);
  const previousQid = await clearStar(bindings.HSA_VOTES_DB, voter.voterHash);

  return json({ starredQid: null, previousQid }, { headers: noStoreHeaders() }, voter.setCookie);
};
