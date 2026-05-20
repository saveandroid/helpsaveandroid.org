import { seedRepresentativeByQid } from '@/data/representatives';
import { renderSafeGfm } from './markdown';
import type { WikidataCandidateDetails } from './wikidata';

export type CandidateRow = {
  qid: string;
  source: 'seed' | 'user';
  label: string;
  description: string | null;
  wikidata_url: string;
  entity_kind: string;
  upvote_count: number;
  star_count: number;
  computed_at: string | null;
};

export type RepresentativeApiRow = {
  qid: string;
  source: 'seed' | 'user';
  label: string;
  description: string | null;
  wikidataUrl: string;
  entityKind: string;
  upvoteCount: number;
  starCount: number;
  computedAt: string | null;
  fallbackStatus: string | null;
  groupHeading: string | null;
  statusHtml: string;
  blockHtml: string;
};

export type EnvBindings = {
  HSA_VOTES_DB: D1Database;
  HSA_WIKIDATA_CACHE: KVNamespace;
  HSA_REP_STATUS: KVNamespace;
  HSA_BLOCKED_QIDS: KVNamespace;
  TURNSTILE_SECRET_KEY?: string;
  HSA_COOKIE_SECRET: string;
  PUBLIC_TURNSTILE_SITE_KEY?: string;
};

export async function isBlocked(env: Pick<EnvBindings, 'HSA_BLOCKED_QIDS'>, qid: string): Promise<string | null> {
  return env.HSA_BLOCKED_QIDS.get(qid);
}

export async function ensureCandidate(db: D1Database, details: WikidataCandidateDetails, addedByHash: string | null): Promise<void> {
  await db
    .prepare(
      `INSERT INTO candidates (
        qid,
        source,
        label,
        description,
        wikidata_url,
        entity_kind,
        added_by_hash,
        created_at
      ) VALUES (?, 'user', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(qid) DO UPDATE SET
        label = excluded.label,
        description = excluded.description,
        wikidata_url = excluded.wikidata_url,
        entity_kind = excluded.entity_kind`,
    )
    .bind(
      details.qid,
      details.label,
      details.description,
      details.wikidataUrl,
      details.entityKind,
      addedByHash,
      new Date().toISOString(),
    )
    .run();

  await db
    .prepare(`INSERT OR IGNORE INTO candidate_counts (qid, upvote_count, star_count, computed_at) VALUES (?, 0, 0, ?)`)
    .bind(details.qid, new Date().toISOString())
    .run();
}

export async function candidateExists(db: D1Database, qid: string): Promise<boolean> {
  const row = await db.prepare('SELECT qid FROM candidates WHERE qid = ?').bind(qid).first<{ qid: string }>();
  return Boolean(row);
}

export async function setUpvote(db: D1Database, qid: string, voterHash: string, active: boolean): Promise<void> {
  if (active) {
    await db
      .prepare('INSERT OR IGNORE INTO upvotes (qid, voter_hash, created_at) VALUES (?, ?, ?)')
      .bind(qid, voterHash, new Date().toISOString())
      .run();
    return;
  }

  await db.prepare('DELETE FROM upvotes WHERE qid = ? AND voter_hash = ?').bind(qid, voterHash).run();
}

export type StarReplacementResult = {
  previousQid: string | null;
  convertedPreviousToUpvote: boolean;
};

export async function replaceStar(db: D1Database, qid: string, voterHash: string): Promise<StarReplacementResult> {
  const now = new Date().toISOString();
  const previous = await db.prepare('SELECT qid FROM stars WHERE voter_hash = ?').bind(voterHash).first<{ qid: string }>();

  if (previous?.qid === qid) {
    return { previousQid: qid, convertedPreviousToUpvote: false };
  }

  let convertedPreviousToUpvote = false;
  if (previous?.qid) {
    const result = await db
      .prepare('INSERT OR IGNORE INTO upvotes (qid, voter_hash, created_at) VALUES (?, ?, ?)')
      .bind(previous.qid, voterHash, now)
      .run();
    convertedPreviousToUpvote = (result.meta?.changes ?? 0) > 0;
  }

  await db
    .prepare(
      `INSERT INTO stars (voter_hash, qid, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(voter_hash) DO UPDATE SET
        qid = excluded.qid,
        updated_at = excluded.updated_at`,
    )
    .bind(voterHash, qid, now, now)
    .run();

  return { previousQid: previous?.qid ?? null, convertedPreviousToUpvote };
}

export async function clearStar(db: D1Database, voterHash: string): Promise<string | null> {
  const previous = await db.prepare('SELECT qid FROM stars WHERE voter_hash = ?').bind(voterHash).first<{ qid: string }>();
  await db.prepare('DELETE FROM stars WHERE voter_hash = ?').bind(voterHash).run();
  return previous?.qid ?? null;
}

export async function refreshCandidateCounts(db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO candidate_counts (qid, upvote_count, star_count, computed_at)
      SELECT
        c.qid,
        COALESCE(u.upvote_count, 0) AS upvote_count,
        COALESCE(s.star_count, 0) AS star_count,
        ? AS computed_at
      FROM candidates c
      LEFT JOIN (
        SELECT qid, COUNT(*) AS upvote_count
        FROM upvotes
        GROUP BY qid
      ) u ON u.qid = c.qid
      LEFT JOIN (
        SELECT qid, COUNT(*) AS star_count
        FROM stars
        GROUP BY qid
      ) s ON s.qid = c.qid
      ON CONFLICT(qid) DO UPDATE SET
        upvote_count = excluded.upvote_count,
        star_count = excluded.star_count,
        computed_at = excluded.computed_at`,
    )
    .bind(new Date().toISOString())
    .run();
}

async function decorateRow(env: Pick<EnvBindings, 'HSA_REP_STATUS' | 'HSA_BLOCKED_QIDS'>, row: CandidateRow): Promise<RepresentativeApiRow | null> {
  const blockReason = await env.HSA_BLOCKED_QIDS.get(row.qid);
  if (blockReason) return null;

  const seed = seedRepresentativeByQid.get(row.qid);
  const statusMarkdown = (await env.HSA_REP_STATUS.get(row.qid)) || seed?.fallbackStatus || '';

  return {
    qid: row.qid,
    source: row.source,
    label: row.label,
    description: row.description,
    wikidataUrl: row.wikidata_url,
    entityKind: row.entity_kind,
    upvoteCount: Number(row.upvote_count ?? 0),
    starCount: Number(row.star_count ?? 0),
    computedAt: row.computed_at,
    fallbackStatus: seed?.fallbackStatus ?? null,
    groupHeading: seed?.groupHeading ?? null,
    statusHtml: renderSafeGfm(statusMarkdown),
    blockHtml: renderSafeGfm(blockReason),
  };
}

export async function getTopRepresentatives(env: EnvBindings, limit = 10): Promise<RepresentativeApiRow[]> {
  const queryLimit = Math.max(limit * 5, 50);
  const result = await env.HSA_VOTES_DB
    .prepare(
      `SELECT
        c.qid,
        c.source,
        c.label,
        c.description,
        c.wikidata_url,
        c.entity_kind,
        COALESCE(cc.upvote_count, 0) AS upvote_count,
        COALESCE(cc.star_count, 0) AS star_count,
        cc.computed_at
      FROM candidates c
      LEFT JOIN candidate_counts cc ON cc.qid = c.qid
      ORDER BY COALESCE(cc.star_count, 0) DESC, COALESCE(cc.upvote_count, 0) DESC, c.label COLLATE NOCASE ASC
      LIMIT ?`,
    )
    .bind(queryLimit)
    .all<CandidateRow>();

  const rows: RepresentativeApiRow[] = [];
  for (const row of result.results ?? []) {
    const decorated = await decorateRow(env, row);
    if (decorated) rows.push(decorated);
    if (rows.length >= limit) break;
  }
  return rows;
}

export async function getRepresentativeRows(env: EnvBindings, qids: string[]): Promise<RepresentativeApiRow[]> {
  const uniqueQids = [...new Set(qids)];
  if (uniqueQids.length === 0) return [];

  const placeholders = uniqueQids.map(() => '?').join(', ');
  const result = await env.HSA_VOTES_DB
    .prepare(
      `SELECT
        c.qid,
        c.source,
        c.label,
        c.description,
        c.wikidata_url,
        c.entity_kind,
        COALESCE(cc.upvote_count, 0) AS upvote_count,
        COALESCE(cc.star_count, 0) AS star_count,
        cc.computed_at
      FROM candidates c
      LEFT JOIN candidate_counts cc ON cc.qid = c.qid
      WHERE c.qid IN (${placeholders})`,
    )
    .bind(...uniqueQids)
    .all<CandidateRow>();

  const byQid = new Map<string, RepresentativeApiRow>();
  for (const row of result.results ?? []) {
    const decorated = await decorateRow(env, row);
    if (decorated) byQid.set(decorated.qid, decorated);
  }
  return uniqueQids.map((qid) => byQid.get(qid)).filter((row): row is RepresentativeApiRow => Boolean(row));
}

export async function getVisitorState(env: EnvBindings, voterHash: string | null): Promise<{
  starredQid: string | null;
  upvotedQids: string[];
  extras: RepresentativeApiRow[];
}> {
  if (!voterHash) return { starredQid: null, upvotedQids: [], extras: [] };

  const [star, upvotes, top] = await Promise.all([
    env.HSA_VOTES_DB.prepare('SELECT qid FROM stars WHERE voter_hash = ?').bind(voterHash).first<{ qid: string }>(),
    env.HSA_VOTES_DB.prepare('SELECT qid FROM upvotes WHERE voter_hash = ? ORDER BY created_at DESC').bind(voterHash).all<{ qid: string }>(),
    getTopRepresentatives(env),
  ]);

  const topQids = new Set(top.map((row) => row.qid));
  const upvotedQids = (upvotes.results ?? []).map((row) => row.qid);
  const personalQids = [...new Set([star?.qid, ...upvotedQids].filter((qid): qid is string => Boolean(qid)))];
  const extraQids = personalQids.filter((qid) => !topQids.has(qid));

  return {
    starredQid: star?.qid ?? null,
    upvotedQids,
    extras: await getRepresentativeRows(env, extraQids),
  };
}
