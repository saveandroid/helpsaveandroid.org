import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isValidQid } from '@/data/representatives';
import { getOrCreateVoterHash } from '@/lib/representatives/cookies';
import { ensureCandidate, getRepresentativeRows, isBlocked } from '@/lib/representatives/db';
import { envBindings, json, noStoreHeaders, readJsonBody } from '@/lib/representatives/http';
import { validateTurnstile } from '@/lib/representatives/turnstile';
import { fetchWikidataDetails } from '@/lib/representatives/wikidata';

type CandidateBody = {
  qid?: unknown;
  turnstileToken?: unknown;
};

export const POST: APIRoute = async ({ request }) => {
  const body = await readJsonBody<CandidateBody>(request);
  const qid = typeof body?.qid === 'string' ? body.qid : '';
  const turnstileToken = typeof body?.turnstileToken === 'string' ? body.turnstileToken : '';
  const bindings = envBindings(env);

  const turnstileOk = await validateTurnstile(bindings.TURNSTILE_SECRET_KEY, turnstileToken, request.headers.get('CF-Connecting-IP') ?? undefined);
  if (!turnstileOk) return json({ error: 'turnstile_failed' }, { status: 403, headers: noStoreHeaders() });
  if (!isValidQid(qid)) return json({ error: 'invalid_qid' }, { status: 400, headers: noStoreHeaders() });

  const blockReason = await isBlocked(bindings, qid);
  if (blockReason) return json({ error: 'blocked_qid' }, { status: 403, headers: noStoreHeaders() });

  const details = await fetchWikidataDetails(qid, bindings.HSA_WIKIDATA_CACHE);
  if (!details) return json({ error: 'ineligible_qid' }, { status: 422, headers: noStoreHeaders() });

  const voter = await getOrCreateVoterHash(request, bindings.HSA_COOKIE_SECRET);
  await ensureCandidate(bindings.HSA_VOTES_DB, details, voter.voterHash);
  const [candidate] = await getRepresentativeRows(bindings, [qid]);

  return json({ candidate }, { status: 201, headers: noStoreHeaders() }, voter.setCookie);
};
