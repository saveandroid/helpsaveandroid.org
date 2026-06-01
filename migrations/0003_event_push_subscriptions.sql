CREATE TABLE IF NOT EXISTS event_push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  voter_hash TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (voter_hash) REFERENCES event_interest(voter_hash) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS event_push_subscriptions_voter_hash_idx
ON event_push_subscriptions(voter_hash);
