import { describe, expect, it } from 'vitest';
import {
  clearStar,
  getTopRepresentatives,
  getVisitorState,
  refreshCandidateCounts,
  replaceStar,
  setUpvote,
  type EnvBindings,
} from '@/lib/representatives/db';
import { renderSafeGfm } from '@/lib/representatives/markdown';
import { hashVoterId, signVoterId, verifyVoterCookie } from '@/lib/representatives/cookies';
import { detailsFromWikidataEntity } from '@/lib/representatives/wikidata';

type Candidate = {
  qid: string;
  source: 'seed' | 'user';
  label: string;
  description: string | null;
  wikidata_url: string;
  entity_kind: string;
};

class MemoryKv {
  values = new Map<string, string>();

  get(key: string) {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  put(key: string, value: string) {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

class MemoryD1 {
  candidates = new Map<string, Candidate>();
  upvotes = new Set<string>();
  stars = new Map<string, string>();
  counts = new Map<string, { upvote_count: number; star_count: number; computed_at: string }>();

  constructor(candidates: Candidate[]) {
    candidates.forEach((candidate) => {
      this.candidates.set(candidate.qid, candidate);
      this.counts.set(candidate.qid, { upvote_count: 0, star_count: 0, computed_at: 'seed' });
    });
  }

  prepare(sql: string) {
    const db = this;
    let params: unknown[] = [];
    return {
      bind(...values: unknown[]) {
        params = values;
        return this;
      },
      async run() {
        if (sql.includes('INSERT OR IGNORE INTO upvotes')) {
          const [qid, voterHash] = params as string[];
          const key = `${qid}:${voterHash}`;
          const before = db.upvotes.size;
          db.upvotes.add(key);
          return { meta: { changes: db.upvotes.size === before ? 0 : 1 } };
        }
        if (sql.includes('DELETE FROM upvotes')) {
          const [qid, voterHash] = params as string[];
          const key = `${qid}:${voterHash}`;
          const existed = db.upvotes.delete(key);
          return { meta: { changes: existed ? 1 : 0 } };
        }
        if (sql.includes('INSERT INTO stars')) {
          const [voterHash, qid] = params as string[];
          db.stars.set(voterHash, qid);
          return { meta: { changes: 1 } };
        }
        if (sql.includes('DELETE FROM stars')) {
          const [voterHash] = params as string[];
          const existed = db.stars.delete(voterHash);
          return { meta: { changes: existed ? 1 : 0 } };
        }
        if (sql.includes('INSERT INTO candidate_counts') && sql.includes('SELECT')) {
          const [computedAt] = params as string[];
          db.candidates.forEach((_candidate, qid) => {
            const upvote_count = [...db.upvotes].filter((key) => key.startsWith(`${qid}:`)).length;
            const star_count = [...db.stars.values()].filter((starredQid) => starredQid === qid).length;
            db.counts.set(qid, { upvote_count, star_count, computed_at: computedAt });
          });
          return { meta: { changes: db.candidates.size } };
        }
        return { meta: { changes: 0 } };
      },
      async first<T>() {
        if (sql.includes('SELECT qid FROM stars')) {
          const [voterHash] = params as string[];
          const qid = db.stars.get(voterHash);
          return (qid ? { qid } : null) as T | null;
        }
        if (sql.includes('SELECT qid FROM candidates')) {
          const [qid] = params as string[];
          return (db.candidates.has(qid) ? { qid } : null) as T | null;
        }
        return null;
      },
      async all<T>() {
        if (sql.includes('SELECT qid FROM upvotes')) {
          const [voterHash] = params as string[];
          return {
            results: [...db.upvotes]
              .filter((key) => key.endsWith(`:${voterHash}`))
              .map((key) => ({ qid: key.split(':')[0] })),
          } as { results: T[] };
        }
        if (sql.includes('WHERE c.qid IN')) {
          const rows = (params as string[])
            .map((qid) => db.row(qid))
            .filter((row): row is ReturnType<MemoryD1['row']> => Boolean(row));
          return { results: rows as T[] };
        }
        if (sql.includes('FROM candidates c')) {
          const limit = Number(params[0] ?? 10);
          const rows = [...db.candidates.keys()]
            .map((qid) => db.row(qid))
            .filter((row): row is ReturnType<MemoryD1['row']> => Boolean(row))
            .sort(
              (left, right) =>
                right!.star_count - left!.star_count ||
                right!.upvote_count - left!.upvote_count ||
                left!.label.localeCompare(right!.label),
            )
            .slice(0, limit);
          return { results: rows as T[] };
        }
        return { results: [] as T[] };
      },
    };
  }

  row(qid: string) {
    const candidate = this.candidates.get(qid);
    if (!candidate) return null;
    const counts = this.counts.get(qid) ?? { upvote_count: 0, star_count: 0, computed_at: null };
    return {
      ...candidate,
      ...counts,
      computed_at: counts.computed_at,
    };
  }
}

function candidate(qid: string, label: string): Candidate {
  return {
    qid,
    source: 'seed',
    label,
    description: `${label} description`,
    wikidata_url: `https://www.wikidata.org/wiki/${qid}`,
    entity_kind: 'human',
  };
}

function env(db: MemoryD1, blockKv = new MemoryKv(), statusKv = new MemoryKv()): EnvBindings {
  return {
    HSA_VOTES_DB: db as unknown as D1Database,
    HSA_WIKIDATA_CACHE: new MemoryKv() as unknown as KVNamespace,
    HSA_REP_STATUS: statusKv as unknown as KVNamespace,
    HSA_BLOCKED_QIDS: blockKv as unknown as KVNamespace,
    HSA_COOKIE_SECRET: 'test-secret',
  };
}

describe('representative voting', () => {
  it('rejects tampered voter cookies', async () => {
    const signed = await signVoterId('secret', 'abcdefghijabcdefghijabcdefghij');
    expect(await verifyVoterCookie('secret', signed)).toBe('abcdefghijabcdefghijabcdefghij');
    expect(await verifyVoterCookie('secret', `${signed}x`)).toBeNull();
    expect(await hashVoterId('secret', 'same')).toBe(await hashVoterId('secret', 'same'));
  });

  it('sets and unsets upvotes idempotently', async () => {
    const db = new MemoryD1([candidate('Q1', 'Alpha')]);
    await setUpvote(db as unknown as D1Database, 'Q1', 'voter', true);
    await setUpvote(db as unknown as D1Database, 'Q1', 'voter', true);
    expect(db.upvotes.size).toBe(1);

    await setUpvote(db as unknown as D1Database, 'Q1', 'voter', false);
    await setUpvote(db as unknown as D1Database, 'Q1', 'voter', false);
    expect(db.upvotes.size).toBe(0);
  });

  it('converts a replaced star into one upvote', async () => {
    const db = new MemoryD1([candidate('Q1', 'Alpha'), candidate('Q2', 'Beta')]);
    await replaceStar(db as unknown as D1Database, 'Q1', 'voter');
    const result = await replaceStar(db as unknown as D1Database, 'Q2', 'voter');
    const repeat = await replaceStar(db as unknown as D1Database, 'Q1', 'voter');

    expect(result).toEqual({ previousQid: 'Q1', convertedPreviousToUpvote: true });
    expect(repeat).toEqual({ previousQid: 'Q2', convertedPreviousToUpvote: true });
    expect(db.upvotes.has('Q1:voter')).toBe(true);
    expect(db.upvotes.has('Q2:voter')).toBe(true);
    expect(db.stars.get('voter')).toBe('Q1');
  });

  it('clears only the star', async () => {
    const db = new MemoryD1([candidate('Q1', 'Alpha')]);
    await setUpvote(db as unknown as D1Database, 'Q1', 'voter', true);
    await replaceStar(db as unknown as D1Database, 'Q1', 'voter');

    expect(await clearStar(db as unknown as D1Database, 'voter')).toBe('Q1');
    expect(db.stars.has('voter')).toBe(false);
    expect(db.upvotes.has('Q1:voter')).toBe(true);
  });

  it('refreshes aggregate counts and omits blocked top rows', async () => {
    const db = new MemoryD1([candidate('Q1', 'Alpha'), candidate('Q2', 'Beta')]);
    const blockKv = new MemoryKv();
    blockKv.values.set('Q2', 'blocked **reason**');
    await setUpvote(db as unknown as D1Database, 'Q1', 'one', true);
    await setUpvote(db as unknown as D1Database, 'Q2', 'one', true);
    await replaceStar(db as unknown as D1Database, 'Q2', 'one');
    await refreshCandidateCounts(db as unknown as D1Database);

    expect(db.counts.get('Q1')?.upvote_count).toBe(1);
    expect(db.counts.get('Q2')?.star_count).toBe(1);
    await expect(getTopRepresentatives(env(db, blockKv))).resolves.toHaveLength(1);
  });

  it('returns visitor rows outside the public top list', async () => {
    const db = new MemoryD1([
      candidate('Q1', 'Alpha'),
      candidate('Q2', 'Beta'),
      candidate('Q3', 'Charlie'),
      candidate('Q4', 'Delta'),
      candidate('Q5', 'Echo'),
      candidate('Q6', 'Foxtrot'),
      candidate('Q7', 'Golf'),
      candidate('Q8', 'Hotel'),
      candidate('Q9', 'India'),
      candidate('Q10', 'Juliet'),
      candidate('Q11', 'Zulu'),
    ]);
    for (let index = 1; index <= 10; index += 1) {
      await replaceStar(db as unknown as D1Database, `Q${index}`, `voter-${index}`);
    }
    await setUpvote(db as unknown as D1Database, 'Q11', 'me', true);
    await refreshCandidateCounts(db as unknown as D1Database);

    const state = await getVisitorState(env(db), 'me');
    expect(state.upvotedQids).toEqual(['Q11']);
    expect(state.extras.map((row) => row.qid)).toEqual(['Q11']);
  });

  it('sanitizes markdown status and block reasons', () => {
    const html = renderSafeGfm('[ok](javascript:alert(1)) <script>alert(1)</script> **bold**');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('accepts public audience entities and rejects media/list search results', () => {
    const tameImpala = detailsFromWikidataEntity({
      id: 'Q9619',
      labels: { en: { value: 'Tame Impala' } },
      descriptions: { en: { value: 'Australian musical group; psychedelic rock musical project' } },
      claims: {
        P31: [{ mainsnak: { datavalue: { value: { id: 'Q215380' } } } }],
        P2002: [{ mainsnak: { datavalue: { value: 'tameimpala' } } }],
      },
    });
    const album = detailsFromWikidataEntity({
      id: 'Q7681106',
      labels: { en: { value: 'Tame Impala EP' } },
      descriptions: { en: { value: '2008 extended play by Tame Impala' } },
      claims: {
        P31: [{ mainsnak: { datavalue: { value: { id: 'Q169930' } } } }],
        P856: [{ mainsnak: { datavalue: { value: 'https://example.com' } } }],
      },
    });

    expect(tameImpala?.entityKind).toBe('account');
    expect(album).toBeNull();
  });
});
