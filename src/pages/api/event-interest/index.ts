import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getEventInterestCounts, getEventInterestState, setEventInterest, type EventInterestCounts } from '@/lib/event-interest/db';
import { getExistingVoterHash, getOrCreateVoterHash } from '@/lib/representatives/cookies';
import { envBindings, json, noStoreHeaders, readJsonBody } from '@/lib/representatives/http';
import { validateTurnstile } from '@/lib/representatives/turnstile';

type EventInterestBody = {
  joined?: unknown;
  withoutTameImpala?: unknown;
  turnstileToken?: unknown;
};

function countCacheRequest(request: Request) {
  return new Request(new URL('/api/event-interest/counts-cache-key', request.url).toString(), {
    method: 'GET',
  });
}

async function getCachedCounts(request: Request, db: D1Database): Promise<EventInterestCounts> {
  if (typeof caches === 'undefined') return getEventInterestCounts(db);

  const cache = caches.default;
  const cacheKey = countCacheRequest(request);
  const cached = await cache.match(cacheKey).catch(() => null);
  if (cached) return (await cached.json()) as EventInterestCounts;

  const counts = await getEventInterestCounts(db);
  await cache
    .put(
      cacheKey,
      json(counts, {
        headers: {
          'Cache-Control': 'public, max-age=20',
        },
      }),
    )
    .catch(() => undefined);
  return counts;
}

export const GET: APIRoute = async ({ request }) => {
  const bindings = envBindings(env);
  const voterHash = await getExistingVoterHash(request, bindings.HSA_COOKIE_SECRET);
  const counts = await getCachedCounts(request, bindings.HSA_VOTES_DB);
  const state = await getEventInterestState(bindings.HSA_VOTES_DB, voterHash, counts);

  return json(state, {
    headers: noStoreHeaders(),
  });
};

export const PUT: APIRoute = async ({ request }) => {
  const body = await readJsonBody<EventInterestBody>(request);
  const joined = body?.joined === true;
  const withoutTameImpala = body?.withoutTameImpala === true;
  const turnstileToken = typeof body?.turnstileToken === 'string' ? body.turnstileToken : '';
  const bindings = envBindings(env);

  const turnstileOk = await validateTurnstile(bindings.TURNSTILE_SECRET_KEY, turnstileToken, request.headers.get('CF-Connecting-IP') ?? undefined);
  if (!turnstileOk) return json({ error: 'turnstile_failed' }, { status: 403, headers: noStoreHeaders() });

  const voter = await getOrCreateVoterHash(request, bindings.HSA_COOKIE_SECRET);
  const state = await setEventInterest(bindings.HSA_VOTES_DB, voter.voterHash, joined, withoutTameImpala);
  if (typeof caches !== 'undefined') {
    await caches.default.delete(countCacheRequest(request)).catch(() => undefined);
  }

  return json(state, { headers: noStoreHeaders() }, voter.setCookie);
};
