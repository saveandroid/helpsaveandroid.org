CREATE TABLE IF NOT EXISTS event_interest (
  voter_hash TEXT PRIMARY KEY,
  without_tame_impala INTEGER NOT NULL DEFAULT 0 CHECK (without_tame_impala IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_interest_counts (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  without_tame_impala_count INTEGER NOT NULL DEFAULT 0 CHECK (without_tame_impala_count >= 0),
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO event_interest_counts (
  id,
  total_count,
  without_tame_impala_count,
  updated_at
) VALUES (
  1,
  0,
  0,
  '2026-05-31T00:00:00.000Z'
);

CREATE TRIGGER IF NOT EXISTS event_interest_after_insert
AFTER INSERT ON event_interest
BEGIN
  UPDATE event_interest_counts
  SET
    total_count = total_count + 1,
    without_tame_impala_count = without_tame_impala_count + NEW.without_tame_impala,
    updated_at = NEW.updated_at
  WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS event_interest_after_delete
AFTER DELETE ON event_interest
BEGIN
  UPDATE event_interest_counts
  SET
    total_count = MAX(total_count - 1, 0),
    without_tame_impala_count = MAX(without_tame_impala_count - OLD.without_tame_impala, 0),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS event_interest_after_without_update
AFTER UPDATE OF without_tame_impala ON event_interest
BEGIN
  UPDATE event_interest_counts
  SET
    without_tame_impala_count = MAX(without_tame_impala_count + NEW.without_tame_impala - OLD.without_tame_impala, 0),
    updated_at = NEW.updated_at
  WHERE id = 1;
END;
