import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Check,
  CircleCheck,
  ExternalLink,
  Loader2,
  Search,
  Sparkles,
  Star,
  X,
} from 'lucide-react';

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
  description?: string;
  url?: string;
  eligible?: boolean;
  entityKind?: string | null;
  blocked?: boolean;
  known?: boolean;
  blockHtml?: string;
};

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

export default function RepresentativeVoting({ siteKey }: { siteKey: string }) {
  const [topRows, setTopRows] = useState<Representative[]>([]);
  const [extraRows, setExtraRows] = useState<Representative[]>([]);
  const [starredQid, setStarredQid] = useState<string | null>(null);
  const [upvotedQids, setUpvotedQids] = useState<Set<string>>(() => new Set());
  const [deltas, setDeltas] = useState<Record<string, CountDelta>>({});
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [hoverStarQid, setHoverStarQid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);
  const turnstileHostRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetRef = useRef<string | null>(null);
  const turnstileResolverRef = useRef<((token: string) => void) | null>(null);
  const turnstileRejectRef = useRef<((error: Error) => void) | null>(null);

  const topQids = useMemo(() => new Set(topRows.map((row) => row.qid)), [topRows]);
  const rowsByQid = useMemo(() => {
    const map = new Map<string, Representative>();
    uniqueRows([...topRows, ...extraRows]).forEach((row) => map.set(row.qid, row));
    return map;
  }, [extraRows, topRows]);

  const visibleExtras = useMemo(
    () => uniqueRows(extraRows).filter((row) => !topQids.has(row.qid)),
    [extraRows, topQids],
  );

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
          apiJson<{ representatives: Representative[] }>('/api/representatives/top'),
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
      return;
    }

    const controller = new AbortController();
    setSearchedQuery('');
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const url = new URL('https://www.wikidata.org/w/api.php');
        url.searchParams.set('action', 'wbsearchentities');
        url.searchParams.set('language', 'en');
        url.searchParams.set('format', 'json');
        url.searchParams.set('origin', '*');
        url.searchParams.set('limit', '6');
        url.searchParams.set('search', trimmed);

        const response = await fetch(url, { signal: controller.signal });
        const payload = (await response.json()) as {
          search?: Array<{ id: string; label: string; description?: string; concepturi?: string }>;
        };
        const candidates = (payload.search ?? []).filter((result) => /^Q[1-9]\d+$/.test(result.id));
        const eligibility = await apiJson<{
          results: Array<{
            qid: string;
            eligible: boolean;
            label: string | null;
            description: string | null;
            entityKind: string | null;
            blocked: boolean;
            known: boolean;
            blockHtml: string;
          }>;
        }>('/api/representatives/eligibility', {
          method: 'POST',
          body: JSON.stringify({ qids: candidates.map((result) => result.id) }),
          signal: controller.signal,
        });
        const byQid = new Map(eligibility.results.map((result) => [result.qid, result]));

        const selectableResults = candidates
          .map((result) => {
            const checked = byQid.get(result.id);
            return {
              id: result.id,
              label: checked?.label ?? result.label,
              description: checked?.description ?? result.description,
              url: result.concepturi,
              eligible: checked?.eligible ?? false,
              entityKind: checked?.entityKind ?? null,
              blocked: checked?.blocked ?? false,
              known: checked?.known ?? false,
              blockHtml: checked?.blockHtml ?? '',
            };
          })
          .filter((result) => result.eligible || result.blocked);

        setSearchResults(selectableResults);
        setSearchedQuery(trimmed);
      } catch (error) {
        if (!controller.signal.aborted) {
          setSearchResults([]);
          setSearchedQuery(trimmed);
          setMessage({
            text: error instanceof Error ? error.message : 'Search failed.',
            type: 'error',
          });
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 260);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

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
    const firstEnabled = searchResults.find((result) => result.eligible && !result.blocked);
    if (firstEnabled) addCandidate(firstEnabled);
  };

  const trimmedQuery = query.trim();
  const searchIsSettled = searchedQuery === trimmedQuery && trimmedQuery.length >= 2;

  const renderSectionLabel = (label: string, constrained = false) => (
    <div className={['flex items-center gap-3', constrained ? 'mx-auto w-full max-w-3xl' : ''].join(' ')}>
      <div className="h-px flex-1 bg-(--line)" />
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-(--muted)">{label}</p>
      <div className="h-px flex-1 bg-(--line)" />
    </div>
  );

  const renderRows = (rows: Representative[], compact = false, twoColumn = false, horizontalActions = false) => (
    <div className={['grid gap-3', twoColumn ? 'lg:grid-cols-2' : ''].join(' ')}>
      {rows.map((row) => {
        const starred = starredQid === row.qid;
        const upvoted = upvotedQids.has(row.qid);
        const oldStarDimmed = starred && hoverStarQid && hoverStarQid !== row.qid;
        const upvoteBusy = busyAction === `upvote:${row.qid}`;
        const starBusy = busyAction === `star:${row.qid}`;

        return (
          <article
            key={row.qid}
            className={[
              [
                'grid gap-3 rounded-lg border bg-(--paper) p-3 shadow-[0_0.55rem_1.3rem_var(--page-shadow)] transition',
                horizontalActions ? 'sm:grid-cols-[minmax(0,1fr)_8rem]' : 'sm:grid-cols-[minmax(0,1fr)_3.5rem]',
              ].join(' '),
              starred ? 'border-(--accent-strong) ring-2 ring-(--accent)/35' : 'border-(--line)',
              oldStarDimmed ? 'opacity-55' : '',
            ].join(' ')}
          >
            <div className="min-w-0">
              {row.statusHtml && (
                <div
                  className="rep-status mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-(--accent-strong)"
                  dangerouslySetInnerHTML={{ __html: row.statusHtml }}
                />
              )}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className={compact ? 'text-lg font-semibold leading-tight text-(--ink)' : 'text-xl font-semibold leading-tight text-(--ink)'}>
                  {row.label}
                </h3>
                {row.groupHeading && (
                  <span className="rounded-full border border-(--line) bg-(--accent-soft) px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-(--accent-strong)">
                    anti-scam
                  </span>
                )}
                <a
                  href={row.wikidataUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex size-7 items-center justify-center rounded-full border border-(--line) bg-(--paper-raised) text-(--muted) transition hover:border-(--line-strong) hover:text-(--ink)"
                  aria-label={`Open ${row.label} on Wikidata`}
                  title={`Open ${row.label} on Wikidata`}
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
              {row.description && <p className="mt-1 text-base leading-snug text-(--muted)">{row.description}</p>}
            </div>

            <div className={horizontalActions ? 'grid grid-cols-2 gap-2 sm:w-32' : 'grid grid-cols-2 gap-2 sm:w-14 sm:grid-cols-1'}>
              <button
                type="button"
                onClick={() => toggleUpvote(row)}
                disabled={Boolean(busyAction)}
                className={[
                  'inline-flex h-12 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ink)',
                  upvoted
                    ? 'border-(--accent-strong) bg-(--accent-soft) text-(--ink)'
                    : 'border-(--line) bg-(--paper-raised) text-(--muted) hover:border-(--line-strong) hover:text-(--ink)',
                ].join(' ')}
                aria-pressed={upvoted}
                title={upvoted ? 'Remove upvote' : 'Upvote'}
                aria-label={`${upvoted ? 'Remove upvote from' : 'Upvote'} ${row.label}`}
              >
                {upvoteBusy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                <span>{formatter.format(countFor(row, 'upvote'))}</span>
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
                  'inline-flex h-12 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ink)',
                  starred
                    ? 'border-(--amber) bg-[#fff4cd] text-(--ink)'
                    : 'border-(--line) bg-(--paper-raised) text-(--muted) hover:border-(--amber) hover:text-(--ink)',
                ].join(' ')}
                aria-pressed={starred}
                title={starred ? 'Clear star' : 'Star favorite'}
                aria-label={`${starred ? 'Clear star from' : 'Star'} ${row.label}`}
              >
                {starBusy ? <Loader2 className="size-4 animate-spin" /> : <Star className={starred ? 'size-4 fill-current' : 'size-4'} />}
                <span>{formatter.format(countFor(row, 'star'))}</span>
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );

  return (
    <div className="grid gap-5">
      <div ref={turnstileHostRef} className="fixed bottom-0 left-0 size-px overflow-hidden" aria-hidden="true" />

      <form onSubmit={submitSearch} className="rounded-lg border border-(--line) bg-(--paper) p-3">
        <label className="mb-2 block text-sm font-semibold uppercase tracking-[0.12em] text-(--muted)" htmlFor="representative-search">
          Add a person or public account
        </label>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-(--muted)" />
            <input
              id="representative-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Wikidata"
              className="h-12 w-full rounded-lg border border-(--line) bg-(--paper-raised) pl-10 pr-3 text-lg text-(--ink) outline-none transition placeholder:text-(--muted) focus:border-(--accent-strong)"
            />
          </div>
          <button
            type="submit"
            disabled={Boolean(busyAction) || !searchResults.some((result) => result.eligible && !result.blocked)}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-(--accent-strong) bg-(--accent-strong) px-4 text-base font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-(--line) disabled:bg-(--line-strong)"
          >
            <Sparkles className="size-4" />
            Add
          </button>
        </div>

        {(searching || searchResults.length > 0 || searchIsSettled) && (
          <div className="mt-3 grid gap-2">
            {searching && (
              <p className="flex items-center gap-2 text-sm text-(--muted)">
                <Loader2 className="size-4 animate-spin" />
                Searching Wikidata
              </p>
            )}
            {!searching && searchIsSettled && searchResults.length === 0 && (
              <p className="rounded-lg border border-dashed border-(--line) bg-(--paper-raised) p-3 text-sm text-(--muted)">
                No selectable people, organizations, or public accounts found.
              </p>
            )}
            {searchResults.map((result) => (
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
                      known
                    </span>
                  )}
                  {result.entityKind && !result.blocked && (
                    <span className="text-xs font-semibold uppercase tracking-widest text-(--muted)">
                      {result.entityKind}
                    </span>
                  )}
                  {result.blocked && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-(--rose)">
                      <X className="size-3.5" />
                      blocked
                    </span>
                  )}
                </span>
                {result.description && <span className="mt-1 text-sm text-(--muted)">{result.description}</span>}
                {result.blockHtml && (
                  <span
                    className="rep-status mt-1 text-sm text-(--rose)"
                    dangerouslySetInnerHTML={{ __html: result.blockHtml }}
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </form>

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
        renderRows(topRows, false, true)
      )}

      {visibleExtras.length > 0 && (
        <section className="grid gap-3 pt-2">
          {renderSectionLabel('your picks')}
          {renderRows(visibleExtras, true, false, true)}
        </section>
      )}
    </div>
  );
}
