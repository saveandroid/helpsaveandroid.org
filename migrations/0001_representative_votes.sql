CREATE TABLE IF NOT EXISTS candidates (
  qid TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('seed', 'user')),
  label TEXT NOT NULL,
  description TEXT,
  wikidata_url TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  added_by_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS upvotes (
  qid TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (qid, voter_hash)
);

CREATE TABLE IF NOT EXISTS stars (
  voter_hash TEXT PRIMARY KEY,
  qid TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candidate_counts (
  qid TEXT PRIMARY KEY,
  upvote_count INTEGER NOT NULL DEFAULT 0,
  star_count INTEGER NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL
);

INSERT OR IGNORE INTO candidates (
  qid,
  source,
  label,
  description,
  wikidata_url,
  entity_kind,
  added_by_hash,
  created_at
) VALUES
  ('Q58008262', 'seed', 'Louis Rossmann', 'American YouTuber and right-to-repair advocate', 'https://www.wikidata.org/wiki/Q58008262', 'human', NULL, '2026-05-20T00:00:00.000Z'),
  ('Q13423853', 'seed', 'PewDiePie', 'Swedish YouTuber', 'https://www.wikidata.org/wiki/Q13423853', 'human', NULL, '2026-05-20T00:00:00.000Z'),
  ('Q70071434', 'seed', 'Kitboga', 'American Twitch streamer and scambaiter', 'https://www.wikidata.org/wiki/Q70071434', 'human', NULL, '2026-05-20T00:00:00.000Z'),
  ('Q117818819', 'seed', 'Scammer Payback', 'American scambaiting YouTube channel', 'https://www.wikidata.org/wiki/Q117818819', 'account', NULL, '2026-05-20T00:00:00.000Z'),
  ('Q111862397', 'seed', 'Linus Tech Tips', 'Canadian technology YouTube channel', 'https://www.wikidata.org/wiki/Q111862397', 'account', NULL, '2026-05-20T00:00:00.000Z'),
  ('Q15994958', 'seed', 'Marques Brownlee', 'American YouTuber and technology reviewer', 'https://www.wikidata.org/wiki/Q15994958', 'human', NULL, '2026-05-20T00:00:00.000Z'),
  ('Q21621919', 'seed', 'Post Malone', 'American rapper, singer, songwriter, and record producer', 'https://www.wikidata.org/wiki/Q21621919', 'human', NULL, '2026-05-20T00:00:00.000Z');

INSERT OR IGNORE INTO candidate_counts (qid, upvote_count, star_count, computed_at)
SELECT qid, 0, 0, '2026-05-20T00:00:00.000Z'
FROM candidates;
