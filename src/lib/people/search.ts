import { normalisePersonQuery } from './normalise';
import type { PersonResult, PersonSource, PersonTuple } from './types';

const SCORE = {
  exactName: 1000,
  exactAlias: 950,
  nameStarts: 850,
  aliasStarts: 800,
  tokenStarts: 650,
  contains: 400,
  compactContains: 360,
} as const;

function compact(value: string): string {
  return value.replace(/\s/g, '');
}

function scoreCandidate(candidate: string, query: string, isName: boolean): number {
  if (!candidate || !query) return 0;
  if (candidate === query) return isName ? SCORE.exactName : SCORE.exactAlias;
  if (candidate.startsWith(query)) return isName ? SCORE.nameStarts : SCORE.aliasStarts;
  if (candidate.split(' ').some((part) => part.startsWith(query))) return SCORE.tokenStarts;
  if (candidate.includes(query)) return SCORE.contains;

  const compactCandidate = compact(candidate);
  const compactQuery = compact(query);
  if (compactQuery.length >= 3 && compactCandidate.includes(compactQuery)) return SCORE.compactContains;

  return 0;
}

export function personTupleToResult(tuple: PersonTuple, query: string, source: PersonSource): PersonResult | null {
  const [id, name, aliases, popularity] = tuple;
  const q = normalisePersonQuery(query);
  if (!q) return null;

  const candidates = [name, ...aliases].map((value, index) => ({
    value: normalisePersonQuery(value),
    isName: index === 0,
  }));

  const matchScore = candidates.reduce((best, candidate) => Math.max(best, scoreCandidate(candidate.value, q, candidate.isName)), 0);
  if (!matchScore) return null;

  return {
    id,
    name,
    aliases,
    popularity,
    score: matchScore + popularity / 100,
    source,
  };
}

export function searchPeopleLocal(query: string, people: PersonTuple[], limit = 8, source: PersonSource = 'local'): PersonResult[] {
  const q = normalisePersonQuery(query);
  if (!q) return [];

  return people
    .map((person) => personTupleToResult(person, q, source))
    .filter((result): result is PersonResult => Boolean(result))
    .sort((left, right) => right.score - left.score || right.popularity - left.popularity || left.name.localeCompare(right.name))
    .slice(0, limit);
}

export function mergePeopleResults(localResults: PersonResult[], remoteResults: PersonResult[], limit = 10): PersonResult[] {
  const byId = new Map<string, PersonResult>();

  for (const result of [...localResults, ...remoteResults]) {
    const existing = byId.get(result.id);
    if (!existing) {
      byId.set(result.id, result);
      continue;
    }

    byId.set(result.id, {
      ...existing,
      ...result,
      name: existing.source.includes('local') ? existing.name : result.name,
      aliases: [...new Set([...existing.aliases, ...result.aliases])],
      popularity: Math.max(existing.popularity, result.popularity),
      score: Math.max(existing.score, result.score),
      source: existing.source === result.source ? existing.source : 'local+remote',
    });
  }

  return [...byId.values()]
    .sort((left, right) => {
      const leftLocal = left.source.includes('local') ? 1 : 0;
      const rightLocal = right.source.includes('local') ? 1 : 0;
      return right.score - left.score || rightLocal - leftLocal || left.name.localeCompare(right.name);
    })
    .slice(0, limit);
}
