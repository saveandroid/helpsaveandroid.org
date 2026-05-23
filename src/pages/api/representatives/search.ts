import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isValidQid, seedRepresentativeByQid } from '@/data/representatives';
import { normalisePersonQuery } from '@/lib/people/normalise';
import { searchPeopleLocal } from '@/lib/people/search';
import type { PersonResult, PersonTuple } from '@/lib/people/types';
import { candidateExists } from '@/lib/representatives/db';
import { envBindings, json, noStoreHeaders } from '@/lib/representatives/http';
import { renderSafeGfm } from '@/lib/representatives/markdown';
import { fetchWikidataDetails, fetchWikidataDetailsBatch } from '@/lib/representatives/wikidata';

type WikidataSearchItem = {
  id: string;
  label: string;
  description?: string;
  concepturi?: string;
  aliases?: string[];
};

type RemoteRepresentativeResult = {
  id: string;
  label: string;
  aliases: string[];
  popularity: number;
  score: number;
  source: PersonResult['source'];
  description: string | null;
  url: string;
  eligible: boolean;
  entityKind: string | null;
  blocked: boolean;
  known: boolean;
  blockHtml: string;
};

const WIKIMEDIA_USER_AGENT = 'helpsaveandroid.org representative voting search/1.0 (ideas@helpsaveandroid.org)';

function numberParam(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), max);
}

async function wikidataSearch(query: string, limit: number): Promise<WikidataSearchItem[]> {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbsearchentities');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('search', query);

  const response = await fetch(url, {
    headers: {
      'User-Agent': WIKIMEDIA_USER_AGENT,
      'Api-User-Agent': WIKIMEDIA_USER_AGENT,
    },
  });
  if (!response.ok) return [];

  const payload = (await response.json()) as { search?: WikidataSearchItem[] };
  return (payload.search ?? []).filter((result) => isValidQid(result.id));
}

function seedTuples(): PersonTuple[] {
  return [...seedRepresentativeByQid.values()].map((seed, index) => [
    seed.qid,
    seed.label,
    [],
    9000 - index * 50,
  ]);
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const rawQuery = url.searchParams.get('q') ?? '';
  const query = normalisePersonQuery(rawQuery);
  const limit = numberParam(url.searchParams.get('limit'), 10, 20);

  if (query.length < 2) {
    return json({ query: rawQuery, results: [] }, { headers: noStoreHeaders() });
  }

  const bindings = envBindings(env);
  const directQid = isValidQid(rawQuery.trim()) ? rawQuery.trim() : null;
  const [wikidataItems, directDetails] = await Promise.all([
    query.length >= 3 ? wikidataSearch(rawQuery.trim(), Math.max(limit * 2, 12)) : Promise.resolve([]),
    directQid ? fetchWikidataDetails(directQid, bindings.HSA_WIKIDATA_CACHE) : Promise.resolve(null),
  ]);

  const localSeedResults = searchPeopleLocal(query, seedTuples(), limit, 'remote');
  const searchedTuples: PersonTuple[] = wikidataItems.map((item, index) => [
    item.id,
    item.label,
    item.aliases ?? [],
    5000 - index * 100,
  ]);
  if (directDetails && !searchedTuples.some(([qid]) => qid === directDetails.qid)) {
    searchedTuples.unshift([directDetails.qid, directDetails.label, [], 9000]);
  }

  const rankedWikidataResults = searchPeopleLocal(query, searchedTuples, limit * 2, 'remote');
  const byId = new Map<string, PersonResult>();
  for (const result of [...localSeedResults, ...rankedWikidataResults]) {
    const existing = byId.get(result.id);
    if (!existing || result.score > existing.score) byId.set(result.id, result);
  }

  const ranked = [...byId.values()].sort((left, right) => right.score - left.score).slice(0, limit);
  const detailsByQid = await fetchWikidataDetailsBatch(
    ranked.map((result) => result.id),
    bindings.HSA_WIKIDATA_CACHE,
  );

  const results = await Promise.all(
    ranked.map(async (result): Promise<RemoteRepresentativeResult | null> => {
      const details = detailsByQid.get(result.id);
      const [blockedReason, known] = await Promise.all([
        bindings.HSA_BLOCKED_QIDS.get(result.id),
        candidateExists(bindings.HSA_VOTES_DB, result.id),
      ]);

      const eligible = Boolean(details);
      if (!eligible && !blockedReason) return null;

      return {
        id: result.id,
        label: details?.label ?? result.name,
        aliases: result.aliases,
        popularity: result.popularity,
        score: result.score,
        source: result.source,
        description: details?.description ?? null,
        url: details?.wikidataUrl ?? `https://www.wikidata.org/wiki/${result.id}`,
        eligible,
        entityKind: details?.entityKind ?? null,
        blocked: Boolean(blockedReason),
        known,
        blockHtml: renderSafeGfm(blockedReason),
      };
    }),
  );

  return json(
    {
      query: rawQuery,
      results: results.filter((result): result is RemoteRepresentativeResult => Boolean(result)).slice(0, limit),
    },
    {
      headers: noStoreHeaders(),
    },
  );
};
