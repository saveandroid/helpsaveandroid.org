import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Check, Loader2, PartyPopper, Undo2 } from 'lucide-react';
import { useTurnstileToken } from '@/lib/use-turnstile-token';

type EventInterestState = {
  joined: boolean;
  withoutTameImpala: boolean;
  totalCount: number;
  withoutTameImpalaCount: number;
};

const formatter = new Intl.NumberFormat('en-US');

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

function fireButtonConfetti(button: HTMLButtonElement | null) {
  const rect = button?.getBoundingClientRect();
  const origin = rect
    ? {
        x: (rect.left + rect.width / 2) / window.innerWidth,
        y: (rect.top + rect.height / 2) / window.innerHeight,
      }
    : { x: 0.5, y: 0.62 };

  void confetti({
    particleCount: 86,
    spread: 62,
    startVelocity: 38,
    scalar: 0.92,
    origin,
    colors: ['#fbfbf4', '#3ddc84', '#e5b75a', '#2077b4', '#151611'],
    disableForReducedMotion: true,
  });
}

export default function EventInterestInvite({ siteKey }: { siteKey: string }) {
  const [joined, setJoined] = useState(false);
  const [withoutTameImpala, setWithoutTameImpala] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [withoutTameImpalaCount, setWithoutTameImpalaCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { turnstileHostRef, getTurnstileToken } = useTurnstileToken(siteKey);

  const applyState = (state: EventInterestState) => {
    setJoined(state.joined);
    setWithoutTameImpala(state.withoutTameImpala);
    setTotalCount(state.totalCount);
    setWithoutTameImpalaCount(state.withoutTameImpalaCount);
  };

  const saveState = async (nextJoined: boolean, nextWithoutTameImpala: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const turnstileToken = await getTurnstileToken();
      const nextState = await apiJson<EventInterestState>('/api/event-interest', {
        method: 'PUT',
        body: JSON.stringify({
          joined: nextJoined,
          withoutTameImpala: nextJoined ? nextWithoutTameImpala : false,
          turnstileToken,
        }),
      });
      applyState(nextState);
      if (nextJoined && !joined) fireButtonConfetti(buttonRef.current);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update your invite.');
      throw error;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    apiJson<EventInterestState>('/api/event-interest')
      .then((state) => {
        if (!cancelled) applyState(state);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Could not load the invite count.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleJoined = () => {
    if (busy) return;
    void saveState(!joined, joined ? false : withoutTameImpala).catch(() => {
      // Message state is set in saveState.
    });
  };

  const toggleWithoutTameImpala = (checked: boolean) => {
    if (busy) return;

    const previous = withoutTameImpala;
    setWithoutTameImpala(checked);

    if (!joined) return;

    void saveState(true, checked).catch(() => {
      setWithoutTameImpala(previous);
    });
  };

  return (
    <article
      className={[
        'relative overflow-hidden rounded-lg border px-5 pb-5 pt-4 shadow-[0_0.8rem_1.8rem_var(--page-shadow)] transition-colors duration-500 sm:px-8 sm:pb-6 sm:pt-5',
        joined
          ? 'border-[#0b5d37] bg-[linear-gradient(120deg,#0f633d_0%,#147447_58%,#1e8a56_100%)] text-white'
          : 'border-(--line) bg-[linear-gradient(112deg,var(--paper)_0%,var(--paper-raised)_64%,var(--accent-soft)_130%)] text-(--ink)',
      ].join(' ')}
    >
      <div ref={turnstileHostRef} className="fixed bottom-0 left-0 size-px overflow-hidden" aria-hidden="true" />

      <div
        className={[
          'pointer-events-none absolute inset-y-0 right-0 w-24 border-l border-dashed transition-colors sm:w-32',
          joined
            ? 'border-white/35 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04))]'
            : 'border-(--line) bg-[linear-gradient(180deg,var(--paper-raised),var(--accent-soft))]',
        ].join(' ')}
        aria-hidden="true"
      />
      <div
        className={[
          'pointer-events-none absolute -top-3 right-[calc(6rem-0.75rem)] size-6 rounded-full border shadow-inner sm:right-[calc(8rem-0.75rem)]',
          joined ? 'border-white/20 bg-[#fbfbf4]' : 'border-(--line) bg-(--paper)',
        ].join(' ')}
        aria-hidden="true"
      />
      <div
        className={[
          'pointer-events-none absolute -bottom-3 right-[calc(6rem-0.75rem)] size-6 rounded-full border shadow-inner sm:right-[calc(8rem-0.75rem)]',
          joined ? 'border-white/20 bg-[#fbfbf4]' : 'border-(--line) bg-(--paper)',
        ].join(' ')}
        aria-hidden="true"
      />

      <div className="relative grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="pt-1">
          <h2 className="type-subheading max-w-2xl">
            wanna join the party?
          </h2>

          <p className={['mt-3 max-w-2xl text-[clamp(1rem,1.25vw,1.12rem)] leading-relaxed', joined ? 'text-white/80' : 'text-(--muted)'].join(' ')}>
            we are keeping a tiny headcount while the date comes together.
          </p>
        </div>

        <div className="relative justify-self-end pt-1 text-right tabular-nums">
          <div className="text-3xl font-semibold leading-none sm:text-4xl">
            {loading ? <Loader2 className="ml-auto size-7 animate-spin" /> : formatter.format(totalCount)}
          </div>
          <div className={['mt-1 text-xs font-semibold uppercase tracking-[0.12em]', joined ? 'text-white/70' : 'text-(--muted)'].join(' ')}>
            people in
          </div>
        </div>
      </div>

      <div className="relative mt-6 grid gap-3">
        <button
          ref={buttonRef}
          type="button"
          onClick={toggleJoined}
          disabled={busy}
          aria-pressed={joined}
          className={[
            'inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border px-5 py-3 text-lg font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--ink) disabled:cursor-wait disabled:opacity-75',
            joined
              ? 'border-white bg-white text-[#147447] hover:bg-white/90'
              : 'border-(--accent-strong) bg-(--accent-strong) text-white hover:brightness-105',
          ].join(' ')}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : joined ? (
            <Undo2 className="size-5" />
          ) : (
            <PartyPopper className="size-5" />
          )}
          <span>{joined ? 'change my mind' : "i'd like to go to your event"}</span>
        </button>

        <label
          className={[
            'flex items-center gap-3 px-1 pt-1 text-[clamp(1rem,1.25vw,1.12rem)] leading-relaxed transition-colors',
            joined ? 'text-white' : 'text-(--ink)',
          ].join(' ')}
        >
          <input
            type="checkbox"
            checked={withoutTameImpala}
            disabled={busy}
            onChange={(event) => toggleWithoutTameImpala(event.currentTarget.checked)}
            className="mt-1 size-5 rounded border-(--line-strong) accent-(--accent-strong)"
          />
          <span className="flex flex-wrap gap-x-2">
            even if there's no tame impala
            <span className={['italic', joined ? 'text-white/70' : 'text-(--muted)'].join(' ')}>
              (so there's no stress Kev)
            </span>
          </span>
        </label>

        <div className={['flex min-h-6 flex-wrap items-center gap-2 text-sm', joined ? 'text-white/75' : 'text-(--muted)'].join(' ')}>
          {joined && (
            <span className="inline-flex items-center pl-1 font-semibold">
              you're on the list!
            </span>
          )}
          {!loading && withoutTameImpalaCount > 0 && (
            <span>
              {formatter.format(withoutTameImpalaCount)} okay without Tame Impala too.
            </span>
          )}
        </div>

        {message && (
          <p
            className={[
              'rounded-lg border px-3 py-2 text-sm',
              joined ? 'border-white/25 bg-white/10 text-white' : 'border-(--line) bg-(--paper-raised) text-(--muted)',
            ].join(' ')}
          >
            {message}
          </p>
        )}
      </div>
    </article>
  );
}
