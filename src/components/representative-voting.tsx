import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  ChevronDown,
  Check,
  CircleCheck,
  Database,
  ExternalLink,
  Loader2,
  Maximize2,
  Search,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { mergePeopleResults, searchPeopleLocal } from '@/lib/people/search';
import type { PersonResult, PersonSource, PersonTuple } from '@/lib/people/types';

type Representative = {
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

type VisitorState = {
  starredQid: string | null;
  upvotedQids: string[];
  extras: Representative[];
};

type CountDelta = {
  upvote: number;
  star: number;
};

type MessageState = {
  text: string;
  type: 'error' | 'success';
};

type SearchResult = {
  id: string;
  label: string;
  aliases: string[];
  popularity: number;
  score: number;
  source: PersonSource;
  description?: string;
  url?: string;
  eligible?: boolean;
  entityKind?: string | null;
  blocked?: boolean;
  known?: boolean;
  blockHtml?: string;
};

type SearchState = 'idle' | 'loading-local' | 'ready' | 'searching-remote' | 'error';

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const formatter = new Intl.NumberFormat('en-US');
const POPULAR_PEOPLE_URL = '/people/popular.json';
const RANKED_REPRESENTATIVES_URL = '/api/representatives/top?limit=200';
const entityKindLabel: Record<string, string> = {
  account: 'Account',
  human: 'Human',
  organization: 'Organization',
};

const pillPalettes = [
  { border: '#6f9f31', color: '#4f7f1f' },
  { border: '#2f86b7', color: '#17628f' },
  { border: '#c88317', color: '#8b5b0e' },
  { border: '#c84e55', color: '#9d3038' },
  { border: '#7f68b5', color: '#594394' },
  { border: '#27856f', color: '#166d5a' },
];

function hashString(value: string): number {
  return [...value].reduce((hash, character) => hash + character.charCodeAt(0), 0);
}

function pillStyle(value: string, offset = 0) {
  const palette = pillPalettes[(hashString(value) + offset) % pillPalettes.length];
  return {
    borderColor: `color-mix(in srgb, ${palette.border} 62%, transparent)`,
    color: palette.color,
  };
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueRows(rows: Representative[]): Representative[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.qid)) return false;
    seen.add(row.qid);
    return true;
  });
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

function resultFromPerson(result: PersonResult): SearchResult {
  return {
    id: result.id,
    label: result.name,
    aliases: result.aliases,
    popularity: result.popularity,
    score: result.score,
    source: result.source,
    url: `https://www.wikidata.org/wiki/${result.id}`,
    eligible: true,
    entityKind: null,
    blocked: false,
    known: false,
    blockHtml: '',
  };
}

function searchResultMetaParts(result: SearchResult): string[] {
  const parts = [result.aliases[0], result.description].filter((part): part is string => Boolean(part?.trim()));
  const seen = new Set<string>();

  return parts.filter((part) => {
    const key = part.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueSearchResultAliases(result: SearchResult): string[] {
  const seen = new Set<string>();

  return result.aliases.filter((alias) => {
    const key = alias.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function popularSearchResultMetaParts(result: SearchResult): string[] {
  const aliases = uniqueSearchResultAliases(result);
  const description = result.description?.trim();
  const aliasKeys = new Set(aliases.map((alias) => alias.trim().toLowerCase()));

  return [
    aliases.length > 0 ? `Aliases: ${aliases.join(', ')}` : null,
    description && !aliasKeys.has(description.toLowerCase()) ? description : null,
  ].filter((part): part is string => Boolean(part));
}

function formatEntityKind(value: string): string {
  return entityKindLabel[value] ?? value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function mergeRepresentativeSearchResults(localResults: SearchResult[], remoteResults: SearchResult[], limit = 8): SearchResult[] {
  const mergedPeople = mergePeopleResults(
    localResults.map((result) => ({
      id: result.id,
      name: result.label,
      aliases: result.aliases,
      popularity: result.popularity,
      score: result.score,
      source: result.source,
    })),
    remoteResults.map((result) => ({
      id: result.id,
      name: result.label,
      aliases: result.aliases,
      popularity: result.popularity,
      score: result.score,
      source: result.source,
    })),
    limit,
  );
  const metadataById = new Map([...localResults, ...remoteResults].map((result) => [result.id, result]));

  return mergedPeople.map((person) => {
    const metadata = metadataById.get(person.id);
    return {
      ...metadata,
      id: person.id,
      label: person.name,
      aliases: person.aliases,
      popularity: person.popularity,
      score: person.score,
      source: person.source,
      description: metadata?.description,
      url: metadata?.url ?? `https://www.wikidata.org/wiki/${person.id}`,
      eligible: metadata?.eligible ?? true,
      entityKind: metadata?.entityKind ?? null,
      blocked: metadata?.blocked ?? false,
      known: metadata?.known ?? false,
      blockHtml: metadata?.blockHtml ?? '',
    };
  });
}

export default function RepresentativeVoting({ siteKey }: { siteKey: string }) {
  const [topRows, setTopRows] = useState<Representative[]>([]);
  const [rankedRows, setRankedRows] = useState<Representative[]>([]);
  const [extraRows, setExtraRows] = useState<Representative[]>([]);
  const [starredQid, setStarredQid] = useState<string | null>(null);
  const [upvotedQids, setUpvotedQids] = useState<Set<string>>(() => new Set());
  const [deltas, setDeltas] = useState<Record<string, CountDelta>>({});
  const [rankedExpanded, setRankedExpanded] = useState(false);
  const [databaseOpen, setDatabaseOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [popularPeople, setPopularPeople] = useState<PersonTuple[]>([]);
  const [popularLoadError, setPopularLoadError] = useState<string | null>(null);
  const [rankedLoadError, setRankedLoadError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [hoverStarQid, setHoverStarQid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rankedLoading, setRankedLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);
  const turnstileHostRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetRef = useRef<string | null>(null);
  const turnstileResolverRef = useRef<((token: string) => void) | null>(null);
  const turnstileRejectRef = useRef<((error: Error) => void) | null>(null);
  const popularPeoplePromiseRef = useRef<Promise<PersonTuple[]> | null>(null);
  const rankedRowsPromiseRef = useRef<Promise<Representative[]> | null>(null);

  const topQids = useMemo(() => new Set(topRows.map((row) => row.qid)), [topRows]);
  const rowsByQid = useMemo(() => {
    const map = new Map<string, Representative>();
    uniqueRows([...topRows, ...rankedRows, ...extraRows]).forEach((row) => map.set(row.qid, row));
    return map;
  }, [extraRows, rankedRows, topRows]);
  const rankedPreviewRows = useMemo(
    () => uniqueRows(rankedRows).filter((row) => !topQids.has(row.qid)).slice(0, 10),
    [rankedRows, topQids],
  );
  const displayedQids = useMemo(
    () => new Set([...topRows.map((row) => row.qid), ...(rankedExpanded ? rankedPreviewRows.map((row) => row.qid) : [])]),
    [rankedExpanded, rankedPreviewRows, topRows],
  );
  const visibleExtras = useMemo(
    () => uniqueRows(extraRows).filter((row) => !displayedQids.has(row.qid)),
    [displayedQids, extraRows],
  );
  const databaseRows = useMemo(
    () => uniqueRows([...rankedRows, ...topRows, ...extraRows]),
    [extraRows, rankedRows, topRows],
  );
  const popularSearchResults = useMemo(
    () => searchResults.filter((result) => result.source.includes('local')),
    [searchResults],
  );
  const wikidataSearchResults = useMemo(
    () => searchResults.filter((result) => !result.source.includes('local')),
    [searchResults],
  );
  const orderedSearchResults = useMemo(
    () => [...popularSearchResults, ...wikidataSearchResults],
    [popularSearchResults, wikidataSearchResults],
  );

  const loadPopularPeople = useCallback(async () => {
    if (popularPeople.length > 0) return popularPeople;
    if (popularPeoplePromiseRef.current) return popularPeoplePromiseRef.current;

    setSearchState('loading-local');
    setPopularLoadError(null);
    popularPeoplePromiseRef.current = fetch(POPULAR_PEOPLE_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load popular people (${response.status})`);
        return (await response.json()) as PersonTuple[];
      })
      .then((people) => {
        setPopularPeople(people);
        setSearchState('ready');
        return people;
      })
      .catch((error) => {
        popularPeoplePromiseRef.current = null;
        setSearchState('error');
        setPopularLoadError(error instanceof Error ? error.message : 'Could not load popular people.');
        return [];
      });

    return popularPeoplePromiseRef.current;
  }, [popularPeople]);

  const loadRankedRows = useCallback(async () => {
    if (rankedRows.length > 0) return rankedRows;
    if (rankedRowsPromiseRef.current) return rankedRowsPromiseRef.current;

    setRankedLoading(true);
    setRankedLoadError(null);
    rankedRowsPromiseRef.current = apiJson<{ representatives: Representative[] }>(RANKED_REPRESENTATIVES_URL)
      .then((payload) => {
        setRankedRows(payload.representatives);
        return payload.representatives;
      })
      .catch((error) => {
        rankedRowsPromiseRef.current = null;
        setRankedLoadError(error instanceof Error ? error.message : 'Could not load ranked people.');
        return [];
      })
      .finally(() => {
        setRankedLoading(false);
      });

    return rankedRowsPromiseRef.current;
  }, [rankedRows]);

  const addDelta = (qid: string, field: keyof CountDelta, amount: number) => {
    setDeltas((current) => ({
      ...current,
      [qid]: {
        upvote: (current[qid]?.upvote ?? 0) + (field === 'upvote' ? amount : 0),
        star: (current[qid]?.star ?? 0) + (field === 'star' ? amount : 0),
      },
    }));
  };

  const countFor = (row: Representative, field: keyof CountDelta) => {
    const base = field === 'upvote' ? row.upvoteCount : row.starCount;
    return Math.max(0, base + (deltas[row.qid]?.[field] ?? 0));
  };

  const ensureVisible = (row: Representative) => {
    if (topQids.has(row.qid)) return;
    setExtraRows((current) => uniqueRows([row, ...current]));
  };

  const getTurnstileToken = () => {
    if (!siteKey) return Promise.resolve('dev-turnstile-token');

    return new Promise<string>((resolve, reject) => {
      const start = Date.now();
      const waitForTurnstile = () => {
        if (!turnstileHostRef.current) {
          reject(new Error('Verification widget is not available.'));
          return;
        }
        if (!window.turnstile) {
          if (Date.now() - start > 8000) {
            reject(new Error('Verification did not load. Please try again.'));
            return;
          }
          window.setTimeout(waitForTurnstile, 120);
          return;
        }

        turnstileResolverRef.current = resolve;
        turnstileRejectRef.current = reject;

        if (!turnstileWidgetRef.current) {
          turnstileWidgetRef.current = window.turnstile.render(turnstileHostRef.current, {
            sitekey: siteKey,
            size: 'normal',
            execution: 'execute',
            appearance: 'execute',
            callback: (token: string) => {
              turnstileResolverRef.current?.(token);
              turnstileResolverRef.current = null;
            },
            'error-callback': () => {
              turnstileRejectRef.current?.(new Error('Verification failed. Please try again.'));
              turnstileRejectRef.current = null;
            },
            'expired-callback': () => {
              turnstileRejectRef.current?.(new Error('Verification expired. Please try again.'));
              turnstileRejectRef.current = null;
            },
          });
        }

        window.turnstile.reset(turnstileWidgetRef.current);
        window.turnstile.execute(turnstileWidgetRef.current);
      };

      waitForTurnstile();
    });
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [top, me] = await Promise.all([
          apiJson<{ representatives: Representative[] }>('/api/representatives/top?mode=seed'),
          apiJson<VisitorState>('/api/representatives/me'),
        ]);
        if (cancelled) return;
        setTopRows(top.representatives);
        setExtraRows(me.extras);
        setStarredQid(me.starredQid);
        setUpvotedQids(new Set(me.upvotedQids));
      } catch (error) {
        if (!cancelled) {
          setMessage({
            text: error instanceof Error ? error.message : 'Could not load voting data.',
            type: 'error',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchedQuery('');
      setSearching(false);
      setSearchState(popularPeople.length > 0 ? 'ready' : 'idle');
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setSearchedQuery('');

    const runSearch = async () => {
      try {
        const localPeople = popularPeople.length > 0 ? popularPeople : await loadPopularPeople();
        if (cancelled) return;

        const localResults = searchPeopleLocal(trimmed, localPeople, 8).map(resultFromPerson);
        setSearchResults(localResults);
        setSearchedQuery(trimmed);

        if (trimmed.length < 3) {
          setSearching(false);
          setSearchState('ready');
          return;
        }

        setSearching(localResults.length === 0);
        setSearchState('searching-remote');
        const remote = await apiJson<{ results: SearchResult[] }>(
          `/api/representatives/search?q=${encodeURIComponent(trimmed)}&limit=10`,
          {
            signal: controller.signal,
          },
        );
        if (cancelled) return;

        setSearchResults(mergeRepresentativeSearchResults(localResults, remote.results, 8));
        setSearchState('ready');
      } catch (error) {
        if (!controller.signal.aborted && !cancelled) {
          setSearchResults([]);
          setSearchedQuery(trimmed);
          setSearchState('error');
          setMessage({
            text: error instanceof Error ? error.message : 'Search failed.',
            type: 'error',
          });
        }
      } finally {
        if (!controller.signal.aborted && !cancelled) setSearching(false);
      }
    };

    const timer = window.setTimeout(runSearch, trimmed.length >= 3 ? 180 : 80);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [loadPopularPeople, popularPeople, query]);

  const runAction = async (key: string, action: (token: string) => Promise<void>) => {
    setBusyAction(key);
    setMessage(null);
    try {
      const token = await getTurnstileToken();
      await action(token);
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'The action failed.',
        type: 'error',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const toggleUpvote = (row: Representative) => {
    const active = !upvotedQids.has(row.qid);
    runAction(`upvote:${row.qid}`, async (turnstileToken) => {
      await apiJson('/api/representatives/upvote', {
        method: 'PUT',
        body: JSON.stringify({ qid: row.qid, active, turnstileToken }),
      });
      setUpvotedQids((current) => {
        const next = new Set(current);
        if (active) next.add(row.qid);
        else next.delete(row.qid);
        return next;
      });
      addDelta(row.qid, 'upvote', active ? 1 : -1);
    });
  };

  const toggleStar = (row: Representative) => {
    if (starredQid === row.qid) {
      runAction(`star:${row.qid}`, async (turnstileToken) => {
        await apiJson('/api/representatives/star', {
          method: 'DELETE',
          body: JSON.stringify({ turnstileToken }),
        });
        setStarredQid(null);
        addDelta(row.qid, 'star', -1);
      });
      return;
    }

    const previousQid = starredQid;
    runAction(`star:${row.qid}`, async (turnstileToken) => {
      const result = await apiJson<{ previousQid: string | null; convertedPreviousToUpvote: boolean }>(
        '/api/representatives/star',
        {
          method: 'PUT',
          body: JSON.stringify({ qid: row.qid, turnstileToken }),
        },
      );
      if (previousQid) addDelta(previousQid, 'star', -1);
      addDelta(row.qid, 'star', 1);
      setStarredQid(row.qid);

      if (result.previousQid && result.convertedPreviousToUpvote) {
        const previousRow = rowsByQid.get(result.previousQid);
        setUpvotedQids((current) => new Set(current).add(result.previousQid as string));
        addDelta(result.previousQid, 'upvote', 1);
        if (previousRow) ensureVisible(previousRow);
      }
    });
  };

  const addCandidate = (result: SearchResult) => {
    runAction(`add:${result.id}`, async (turnstileToken) => {
      const payload = await apiJson<{ candidate: Representative }>('/api/representatives/candidates', {
        method: 'POST',
        body: JSON.stringify({ qid: result.id, turnstileToken }),
      });
      ensureVisible(payload.candidate);
      setQuery('');
      setSearchResults([]);
      setMessage({
        text: `${payload.candidate.label} has been added below!`,
        type: 'success',
      });
    });
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const firstEnabled = orderedSearchResults.find((result) => result.eligible && !result.blocked);
    if (firstEnabled) addCandidate(firstEnabled);
  };

  const trimmedQuery = query.trim();
  const searchIsSettled = searchedQuery === trimmedQuery && trimmedQuery.length >= 2;
  const wikidataSearchIsLoading = searchState === 'searching-remote';

  const renderSectionLabel = (label: string, constrained = false) => (
    <div className={['flex items-center gap-3', constrained ? 'mx-auto w-full max-w-3xl' : ''].join(' ')}>
      <div className="h-px flex-1 bg-(--line)" />
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-(--muted)">{label}</p>
      <div className="h-px flex-1 bg-(--line)" />
    </div>
  );

  const renderTagPill = (label: string, offset = 0) => (
    <span
      key={label}
      className="inline-flex h-7 items-center whitespace-nowrap rounded-full border bg-transparent px-2.5 text-xs font-semibold"
      style={pillStyle(label, offset)}
    >
      {label}
    </span>
  );

  const tagsFor = (row: Representative) =>
    [
      formatEntityKind(row.entityKind).toLowerCase(),
      row.source === 'user' ? 'community added' : null,
      row.groupHeading ? 'anti-scam' : null,
    ].filter((tag): tag is string => Boolean(tag));

  const renderPersonTable = (rows: Representative[], options: { ranked?: boolean; dense?: boolean } = {}) => (
    <div className="overflow-hidden rounded-lg border border-(--line) bg-(--paper) shadow-[0_0.6rem_1.4rem_var(--page-shadow)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[58rem] border-separate border-spacing-0 text-left">
          <thead>
            <tr className="bg-(--paper-raised) text-xs font-semibold uppercase tracking-[0.12em] text-(--muted)">
              <th className="w-[36%] px-3 py-2.5">Person</th>
              <th className="w-[22%] px-3 py-2.5">Status</th>
              <th className="w-[24%] px-3 py-2.5">Tags</th>
              <th className="w-[18%] px-3 py-2.5 text-right">Votes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
        const starred = starredQid === row.qid;
        const upvoted = upvotedQids.has(row.qid);
        const oldStarDimmed = starred && hoverStarQid && hoverStarQid !== row.qid;
        const upvoteBusy = busyAction === `upvote:${row.qid}`;
        const starBusy = busyAction === `star:${row.qid}`;
        const statusText = stripHtml(row.statusHtml || row.fallbackStatus || 'status pending') || 'status pending';
        const tags = tagsFor(row);

        return (
          <tr
            key={row.qid}
            className={[
              'group transition hover:bg-(--paper-raised)',
              starred ? 'bg-(--accent-soft)' : '',
              oldStarDimmed ? 'opacity-55' : '',
            ].join(' ')}
          >
            <td className="border-t border-(--line) px-3 py-3 align-middle">
              <div className="flex min-w-0 items-start gap-2.5">
                {options.ranked && (
                  <span className="mt-0.5 inline-flex h-7 min-w-9 items-center justify-center rounded-md border border-(--line) bg-(--paper-raised) px-2 text-xs font-semibold tabular-nums text-(--muted)">
                    #{index + 1}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <h3 className={options.dense ? 'truncate text-base font-semibold leading-tight text-(--ink)' : 'truncate text-lg font-semibold leading-tight text-(--ink)'}>
                      {row.label}
                    </h3>
                    <a
                      href={row.wikidataUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-transparent text-(--muted) opacity-0 transition hover:border-(--line) hover:text-(--ink) group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`Open ${row.label} on Wikidata`}
                      title={`Open ${row.label} on Wikidata`}
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                  {row.description && <p className="mt-1 line-clamp-2 text-sm leading-snug text-(--muted)">{row.description}</p>}
                </div>
              </div>
            </td>
            <td className="border-t border-(--line) px-3 py-3 align-middle">
              <div
                className="rep-status inline-flex min-h-7 max-w-full items-center rounded-full border bg-transparent px-2.5 py-1 text-xs font-semibold leading-tight"
                style={pillStyle(statusText, 2)}
                dangerouslySetInnerHTML={{ __html: row.statusHtml || statusText }}
              />
            </td>
            <td className="border-t border-(--line) px-3 py-3 align-middle">
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag, tagIndex) => renderTagPill(tag, tagIndex))}
              </div>
            </td>
            <td className="border-t border-(--line) px-3 py-3 align-middle">
              <div className="w-full inline-flex justify-end">
                <button
                  type="button"
                  onClick={() => toggleUpvote(row)}
                  disabled={Boolean(busyAction)}
                  className={[
                    'inline-flex h-9 min-w-16 items-center justify-center gap-1 rounded-l-md rounded-r-none border px-1.5 text-sm font-semibold tabular-nums transition focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ink)',
                    upvoted
                      ? 'border-(--accent-strong) bg-(--accent-soft) text-(--ink)'
                      : 'border-(--line) bg-transparent text-(--muted) hover:border-(--line-strong) hover:text-(--ink)',
                  ].join(' ')}
                  aria-pressed={upvoted}
                  title={upvoted ? 'Remove upvote' : 'Upvote'}
                  aria-label={`${upvoted ? 'Remove upvote from' : 'Upvote'} ${row.label}`}
                >
                  {upvoteBusy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                  <span className='pl-0.5'>{formatter.format(countFor(row, 'upvote'))}</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleStar(row)}
                  onPointerEnter={() => setHoverStarQid(row.qid)}
                  onPointerLeave={() => setHoverStarQid(null)}
                  onFocus={() => setHoverStarQid(row.qid)}
                  onBlur={() => setHoverStarQid(null)}
                  disabled={Boolean(busyAction)}
                  className={[
                    '-ml-px inline-flex h-9 min-w-16 items-center justify-center gap-1 rounded-l-none rounded-r-md border px-1.5 text-sm font-semibold tabular-nums transition focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ink)',
                    starred
                      ? 'border-(--amber) bg-[#fff4cd] text-(--ink)'
                      : 'border-(--line) bg-transparent text-(--muted) hover:border-(--amber) hover:text-(--ink)',
                  ].join(' ')}
                  aria-pressed={starred}
                  title={starred ? 'Clear star' : 'Star favorite'}
                  aria-label={`${starred ? 'Clear star from' : 'Star'} ${row.label}`}
                >
                  {starBusy ? <Loader2 className="size-4 animate-spin" /> : <Star className={starred ? 'size-4 fill-current' : 'size-4'} />}
                  <span className='pl-0.5'>{formatter.format(countFor(row, 'star'))}</span>
                </button>
              </div>
            </td>
          </tr>
        );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSearchResult = (result: SearchResult, section: 'popular' | 'wikidata') => {
    const metaParts = section === 'popular' ? popularSearchResultMetaParts(result) : searchResultMetaParts(result);

    return (
      <button
        key={result.id}
        type="button"
        disabled={Boolean(busyAction) || result.blocked || !result.eligible}
        onClick={() => addCandidate(result)}
        className="grid rounded-lg border border-(--line) bg-(--paper-raised) p-3 text-left transition hover:border-(--accent-strong) disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-(--ink)">{result.label}</span>
          <span className="text-sm text-(--muted)">{result.id}</span>
          {result.known && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-(--accent-strong)">
              <Check className="size-3.5" />
              Known
            </span>
          )}
          {result.entityKind && !result.blocked && (
            <span className="text-xs font-semibold uppercase tracking-widest text-(--muted)">
              {formatEntityKind(result.entityKind)}
            </span>
          )}
          {result.blocked && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-(--rose)">
              <X className="size-3.5" />
              Blocked
            </span>
          )}
        </span>
        {metaParts.length > 0 && (
          <span className="mt-1 text-sm text-(--muted)">
            {metaParts.join(' · ')}
          </span>
        )}
        {result.blockHtml && (
          <span className="mt-1 text-sm text-(--rose)">
            Sorry, we can't add {result.label} due to:
            <span
              className="rep-status mt-1 block"
              dangerouslySetInnerHTML={{ __html: result.blockHtml }}
            />
          </span>
        )}
      </button>
    );
  };

  const renderSearchApplication = () => (
    <form onSubmit={submitSearch} className="rounded-lg border border-(--line) bg-(--paper) p-3">
      <label className="mb-2 block text-sm font-semibold uppercase tracking-[0.12em] text-(--muted)" htmlFor="representative-search">
        Add a Person or Public Account
      </label>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-(--muted)" />
          <input
            id="representative-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => {
              void loadPopularPeople();
            }}
            placeholder="Search for a public figure..."
            className="h-12 w-full rounded-lg border border-(--line) bg-(--paper-raised) pl-10 pr-3 text-lg text-(--ink) outline-none transition placeholder:text-(--muted) focus:border-(--accent-strong)"
          />
        </div>
        <button
          type="submit"
          disabled={Boolean(busyAction) || !orderedSearchResults.some((result) => result.eligible && !result.blocked)}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-(--accent-strong) bg-(--accent-strong) px-4 text-base font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-(--line) disabled:bg-(--line-strong)"
        >
          <Sparkles className="size-4" />
          Add
        </button>
      </div>

      {(searching || searchResults.length > 0 || searchIsSettled) && (
        <div className="mt-3 grid gap-2">
          {searchState === 'loading-local' && searchResults.length === 0 && (
            <p className="flex items-center gap-2 text-sm text-(--muted)">
              <Loader2 className="size-4 animate-spin" />
              Loading Popular People
            </p>
          )}
          {popularLoadError && (
            <p className="rounded-lg border border-dashed border-(--line) bg-(--paper-raised) p-3 text-sm text-(--muted)">
              Local suggestions are unavailable. Broader search still works for names with at least three characters.
            </p>
          )}
          {!searching && searchIsSettled && searchResults.length === 0 && (
            <p className="rounded-lg border border-dashed border-(--line) bg-(--paper-raised) p-3 text-sm text-(--muted)">
              No exact match found. Try another name, alias, or handle.
            </p>
          )}
          {popularSearchResults.length > 0 && (
            <div className="grid gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-(--muted)">Popular Results</p>
              {popularSearchResults.map((result) => renderSearchResult(result, 'popular'))}
            </div>
          )}
          {(wikidataSearchResults.length > 0 || wikidataSearchIsLoading) && (
            <div className="grid gap-2">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-(--muted)">
                More From Wikidata
                {wikidataSearchIsLoading && <Loader2 className="size-3.5 animate-spin" />}
              </p>
              {wikidataSearchResults.map((result) => renderSearchResult(result, 'wikidata'))}
              {wikidataSearchIsLoading && wikidataSearchResults.length === 0 && (
                <p className="rounded-lg border border-dashed border-(--line) bg-(--paper-raised) p-3 text-sm text-(--muted)">
                  Searching broader list...
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </form>
  );

  const openRankedPreview = () => {
    setRankedExpanded(true);
    void loadRankedRows();
  };

  const openDatabase = () => {
    setDatabaseOpen(true);
    void loadRankedRows();
  };

  return (
    <div className="grid gap-5">
      <div ref={turnstileHostRef} className="fixed bottom-0 left-0 size-px overflow-hidden" aria-hidden="true" />

      {message && (
        <div className="flex items-start gap-2 rounded-lg border border-(--line) bg-(--paper) p-3 text-sm text-(--ink)">
          {message.type === 'success' ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-(--accent-strong)" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-(--amber)" />
          )}
          <p>{message.text}</p>
        </div>
      )}

      {renderSectionLabel('top picks', true)}

      {loading ? (
        <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-(--line-strong) bg-(--paper)">
          <Loader2 className="size-7 animate-spin text-(--accent-strong)" />
        </div>
      ) : (
        renderPersonTable(topRows)
      )}

      {!rankedExpanded && (
        <button
          type="button"
          onClick={openRankedPreview}
          className="mx-auto inline-flex items-center justify-center gap-2 rounded-full border border-(--line) bg-transparent px-4 py-2 text-sm font-semibold text-(--muted) transition hover:border-(--line-strong) hover:text-(--ink) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ink)"
        >
          <ChevronDown className="size-4" />
          Show More
        </button>
      )}

      {rankedExpanded && (
        <section className="grid gap-4 pt-1">
          {renderSectionLabel('next highest rated')}
          {rankedLoading && rankedPreviewRows.length === 0 ? (
            <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-(--line-strong) bg-(--paper)">
              <Loader2 className="size-6 animate-spin text-(--accent-strong)" />
            </div>
          ) : rankedLoadError ? (
            <p className="rounded-lg border border-dashed border-(--line) bg-(--paper) p-3 text-sm text-(--muted)">
              {rankedLoadError}
            </p>
          ) : rankedPreviewRows.length > 0 ? (
            renderPersonTable(rankedPreviewRows, { ranked: true, dense: true })
          ) : (
            <p className="rounded-lg border border-dashed border-(--line) bg-(--paper) p-3 text-sm text-(--muted)">
              No more ranked people yet.
            </p>
          )}
          <button
            type="button"
            onClick={openDatabase}
            className="mx-auto inline-flex items-center justify-center gap-2 rounded-full border border-(--accent-strong) bg-(--accent-strong) px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105 mt-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ink)"
          >
            <Maximize2 className="size-4" />
            Open Full Database
          </button>
        </section>
      )}

      {visibleExtras.length > 0 && (
        <section className="grid gap-3 pt-2">
          {renderSectionLabel('your picks')}
          {renderPersonTable(visibleExtras, { dense: true })}
        </section>
      )}

      {databaseOpen && (
        <section
          role="dialog"
          aria-modal="true"
          aria-label="People outreach database"
          className="fixed inset-0 z-40 overflow-y-auto bg-(--paper-raised) px-4 py-5 sm:px-6 sm:py-7"
        >
          <div className="mx-auto grid max-w-6xl gap-5">
            <div className="sticky top-0 z-10 -mx-4 border-b border-(--line) bg-(--paper-raised) px-4 py-3 sm:-mx-6 sm:px-6">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.12em] text-(--muted)">People outreach</p>
                  <h2 className="type-subheading text-(--ink)">Full Voting Database</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setDatabaseOpen(false)}
                  className="inline-flex size-10 items-center justify-center rounded-full border border-(--line) bg-transparent text-(--muted) transition hover:border-(--line-strong) hover:text-(--ink) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ink)"
                  aria-label="Close database"
                  title="Close database"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            {renderSearchApplication()}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-(--muted)">
                {databaseRows.length === 1 ? '1 person' : `${formatter.format(databaseRows.length)} people`} currently visible.
              </p>
              <span className="inline-flex items-center gap-2 rounded-full border border-(--line) bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-(--muted)">
                <Database className="size-3.5" />
                Ranked by stars, then upvotes
              </span>
            </div>

            {rankedLoading && databaseRows.length === 0 ? (
              <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-(--line-strong) bg-(--paper)">
                <Loader2 className="size-7 animate-spin text-(--accent-strong)" />
              </div>
            ) : (
              renderPersonTable(databaseRows, { ranked: true, dense: true })
            )}
          </div>
        </section>
      )}
    </div>
  );
}
