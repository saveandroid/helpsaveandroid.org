export type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type StoredPushSubscription = PushSubscriptionInput & {
  voterHash: string;
};

type PushSubscriptionRow = {
  endpoint: string;
  voter_hash: string;
  p256dh: string;
  auth: string;
};

function fromRow(row: PushSubscriptionRow): StoredPushSubscription {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
    voterHash: row.voter_hash,
  };
}

export function isPushSubscriptionInput(value: unknown): value is PushSubscriptionInput {
  if (!value || typeof value !== 'object') return false;
  const subscription = value as PushSubscriptionInput;
  return (
    typeof subscription.endpoint === 'string' &&
    subscription.endpoint.startsWith('https://') &&
    typeof subscription.keys?.p256dh === 'string' &&
    subscription.keys.p256dh.length > 0 &&
    typeof subscription.keys?.auth === 'string' &&
    subscription.keys.auth.length > 0
  );
}

export async function eventInterestExists(db: D1Database, voterHash: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS present FROM event_interest WHERE voter_hash = ?').bind(voterHash).first<{ present: number }>();
  return Boolean(row);
}

export async function saveEventPushSubscription(
  db: D1Database,
  voterHash: string,
  subscription: PushSubscriptionInput,
  userAgent: string | null,
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO event_push_subscriptions (
        endpoint,
        voter_hash,
        p256dh,
        auth,
        user_agent,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        voter_hash = excluded.voter_hash,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        updated_at = excluded.updated_at`,
    )
    .bind(subscription.endpoint, voterHash, subscription.keys.p256dh, subscription.keys.auth, userAgent, now, now)
    .run();
}

export async function deleteEventPushSubscription(db: D1Database, endpoint: string): Promise<void> {
  await db.prepare('DELETE FROM event_push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
}

export async function deleteEventPushSubscriptionsForVoter(db: D1Database, voterHash: string): Promise<void> {
  await db.prepare('DELETE FROM event_push_subscriptions WHERE voter_hash = ?').bind(voterHash).run();
}

export async function listEventPushSubscriptions(db: D1Database): Promise<StoredPushSubscription[]> {
  const result = await db
    .prepare(
      `SELECT endpoint, voter_hash, p256dh, auth
      FROM event_push_subscriptions
      ORDER BY created_at ASC`,
    )
    .all<PushSubscriptionRow>();

  return (result.results ?? []).map(fromRow);
}
