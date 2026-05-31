export type EventInterestCounts = {
  totalCount: number;
  withoutTameImpalaCount: number;
};

export type EventInterestState = EventInterestCounts & {
  joined: boolean;
  withoutTameImpala: boolean;
};

type CountRow = {
  total_count: number | null;
  without_tame_impala_count: number | null;
};

type VisitorRow = {
  without_tame_impala: number | null;
};

const emptyCounts: EventInterestCounts = {
  totalCount: 0,
  withoutTameImpalaCount: 0,
};

function fromCountRow(row: CountRow | null): EventInterestCounts {
  if (!row) return emptyCounts;
  return {
    totalCount: Math.max(0, Number(row.total_count ?? 0)),
    withoutTameImpalaCount: Math.max(0, Number(row.without_tame_impala_count ?? 0)),
  };
}

export async function getEventInterestCounts(db: D1Database): Promise<EventInterestCounts> {
  const row = await db
    .prepare('SELECT total_count, without_tame_impala_count FROM event_interest_counts WHERE id = 1')
    .first<CountRow>();

  return fromCountRow(row);
}

export async function getEventInterestState(
  db: D1Database,
  voterHash: string | null,
  knownCounts?: EventInterestCounts,
): Promise<EventInterestState> {
  const [counts, visitor] = await Promise.all([
    knownCounts ? Promise.resolve(knownCounts) : getEventInterestCounts(db),
    voterHash
      ? db
          .prepare('SELECT without_tame_impala FROM event_interest WHERE voter_hash = ?')
          .bind(voterHash)
          .first<VisitorRow>()
      : Promise.resolve(null),
  ]);

  return {
    ...counts,
    joined: Boolean(visitor),
    withoutTameImpala: Number(visitor?.without_tame_impala ?? 0) === 1,
  };
}

export async function setEventInterest(
  db: D1Database,
  voterHash: string,
  joined: boolean,
  withoutTameImpala: boolean,
): Promise<EventInterestState> {
  const now = new Date().toISOString();

  if (joined) {
    await db
      .prepare(
        `INSERT INTO event_interest (
          voter_hash,
          without_tame_impala,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(voter_hash) DO UPDATE SET
          without_tame_impala = excluded.without_tame_impala,
          updated_at = excluded.updated_at`,
      )
      .bind(voterHash, withoutTameImpala ? 1 : 0, now, now)
      .run();
  } else {
    await db.prepare('DELETE FROM event_interest WHERE voter_hash = ?').bind(voterHash).run();
  }

  return getEventInterestState(db, voterHash);
}
