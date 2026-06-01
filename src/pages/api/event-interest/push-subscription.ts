import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  deleteEventPushSubscription,
  deleteEventPushSubscriptionsForVoter,
  eventInterestExists,
  isPushSubscriptionInput,
  saveEventPushSubscription,
} from '@/lib/event-interest/push-db';
import { getExistingVoterHash } from '@/lib/representatives/cookies';
import { envBindings, json, noStoreHeaders, readJsonBody } from '@/lib/representatives/http';

type PushSubscriptionBody = {
  subscription?: unknown;
};

function endpointFromBody(body: PushSubscriptionBody | null): string | null {
  const subscription = body?.subscription;
  if (!subscription || typeof subscription !== 'object') return null;
  const endpoint = (subscription as { endpoint?: unknown }).endpoint;
  return typeof endpoint === 'string' && endpoint.startsWith('https://') ? endpoint : null;
}

export const POST: APIRoute = async ({ request }) => {
  const body = await readJsonBody<PushSubscriptionBody>(request);
  const subscription = body?.subscription;
  if (!isPushSubscriptionInput(subscription)) {
    return json({ error: 'invalid_push_subscription' }, { status: 400, headers: noStoreHeaders() });
  }

  const bindings = envBindings(env);
  const voterHash = await getExistingVoterHash(request, bindings.HSA_COOKIE_SECRET);
  if (!voterHash) return json({ error: 'event_interest_required' }, { status: 401, headers: noStoreHeaders() });
  if (!(await eventInterestExists(bindings.HSA_VOTES_DB, voterHash))) {
    return json({ error: 'event_interest_required' }, { status: 409, headers: noStoreHeaders() });
  }

  await saveEventPushSubscription(bindings.HSA_VOTES_DB, voterHash, subscription, request.headers.get('User-Agent'));

  return json({ ok: true }, { headers: noStoreHeaders() });
};

export const DELETE: APIRoute = async ({ request }) => {
  const body = await readJsonBody<PushSubscriptionBody>(request);
  const bindings = envBindings(env);
  const voterHash = await getExistingVoterHash(request, bindings.HSA_COOKIE_SECRET);
  const endpoint = endpointFromBody(body);

  if (endpoint) {
    await deleteEventPushSubscription(bindings.HSA_VOTES_DB, endpoint);
  } else if (voterHash) {
    await deleteEventPushSubscriptionsForVoter(bindings.HSA_VOTES_DB, voterHash);
  }

  return json({ ok: true }, { headers: noStoreHeaders() });
};
