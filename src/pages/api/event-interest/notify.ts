import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { deleteEventPushSubscription, listEventPushSubscriptions } from '@/lib/event-interest/push-db';
import { sendWebPush, type WebPushPayload } from '@/lib/event-interest/web-push';
import { envBindings, json, noStoreHeaders, readJsonBody } from '@/lib/representatives/http';

type NotifyBody = {
  title?: unknown;
  body?: unknown;
  url?: unknown;
  tag?: unknown;
  ttl?: unknown;
};

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function bearerToken(request: Request): string {
  const header = request.headers.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
}

export const POST: APIRoute = async ({ request }) => {
  const bindings = envBindings(env);
  if (!bindings.HSA_EVENT_NOTIFY_SECRET || bearerToken(request) !== bindings.HSA_EVENT_NOTIFY_SECRET) {
    return json({ error: 'unauthorized' }, { status: 401, headers: noStoreHeaders() });
  }
  if (!bindings.HSA_WEB_PUSH_PUBLIC_KEY || !bindings.HSA_WEB_PUSH_PRIVATE_KEY) {
    return json({ error: 'web_push_not_configured' }, { status: 500, headers: noStoreHeaders() });
  }

  const body = await readJsonBody<NotifyBody>(request);
  const title = text(body?.title, 80);
  const notificationBody = text(body?.body, 220);
  if (!title || !notificationBody) {
    return json({ error: 'invalid_notification' }, { status: 400, headers: noStoreHeaders() });
  }

  const payload: WebPushPayload = {
    title,
    body: notificationBody,
  };
  const url = text(body?.url, 500);
  if (url) payload.url = url;
  const tag = text(body?.tag, 80);
  if (tag) payload.tag = tag;
  const ttlInput = body?.ttl;
  const ttl = typeof ttlInput === 'number' && ttlInput > 0 ? Math.min(ttlInput, 60 * 60 * 24 * 28) : undefined;

  const subscriptions = await listEventPushSubscriptions(bindings.HSA_VOTES_DB);
  let sent = 0;
  let failed = 0;
  let expired = 0;

  for (const subscription of subscriptions) {
    try {
      const response = await sendWebPush(subscription, payload, {
        publicKey: bindings.HSA_WEB_PUSH_PUBLIC_KEY,
        privateKey: bindings.HSA_WEB_PUSH_PRIVATE_KEY,
        subject: bindings.HSA_WEB_PUSH_SUBJECT ?? 'mailto:hello@helpsaveandroid.org',
        ttl,
      });

      if (response.ok || response.status === 201 || response.status === 202) {
        sent += 1;
      } else if (response.status === 404 || response.status === 410) {
        expired += 1;
        await deleteEventPushSubscription(bindings.HSA_VOTES_DB, subscription.endpoint);
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return json(
    {
      ok: true,
      attempted: subscriptions.length,
      sent,
      expired,
      failed,
    },
    { headers: noStoreHeaders() },
  );
};
