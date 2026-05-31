import { useEffect, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';

type Representative = {
  qid: string;
  label: string;
  description: string | null;
  wikidataUrl: string;
};

type RepresentativeSelections = {
  starred: Representative | null;
  upvoted: Representative[];
};

type EventInterestSnapshot = {
  joined: boolean;
};

type ChecklistItem = {
  id: string;
  text: string;
  children?: ChecklistItem[];
};

type ChecklistGroup = {
  id: string;
  title: string;
  accent: string;
  items: ChecklistItem[];
};

type StoredChecklist = {
  checked?: Record<string, boolean>;
};

const CHECKLIST_STORAGE_KEY = 'hsa.actionChecklist.v1';
const REPRESENTATIVE_SELECTIONS_KEY = 'hsa.representativeSelections.v1';
const EVENT_INTEREST_KEY = 'hsa.eventInterest.v1';
const checkboxClassName = 'action-checklist-checkbox mt-[0.38rem] self-start';

const baseGroups: ChecklistGroup[] = [
  {
    id: 'anyone',
    title: 'anyone',
    accent: 'var(--accent-strong)',
    items: [
      { id: 'anyone-discord-bio', text: 'putting the link in your discord bio' },
      { id: 'anyone-friend', text: 'telling a friend at work or school' },
      { id: 'anyone-discord-chat', text: 'joining our discord chat' },
      { id: 'anyone-post-online', text: 'posting about it online on any platform' },
      { id: 'anyone-share-link', text: 'sharing the link to someone who might care' },
    ],
  },
  {
    id: 'discord',
    title: 'on discord',
    accent: 'var(--blue)',
    items: [
      { id: 'discord-bio', text: 'add helpsaveandroid.org to your discord bio' },
      { id: 'discord-server', text: 'send the link in a server where it fits' },
      { id: 'discord-join', text: 'join our discord' },
    ],
  },
  {
    id: 'curious-cat',
    title: 'as a curious cat',
    accent: 'var(--amber)',
    items: [
      {
        id: 'curious-install-fdroid',
        text: 'install f-droid basic',
        children: [
          { id: 'curious-install-fdroid-why', text: 'notice that it is a simpler, safer way to browse open apps' },
        ],
      },
      { id: 'curious-app-directory', text: 'look around the apps in our apps directory' },
      {
        id: 'curious-open-app',
        text: 'try out a new, open source app',
        children: [
          { id: 'curious-open-app-install', text: 'install one app that seems genuinely useful or fun' },
          { id: 'curious-open-app-share', text: 'tell one person what felt different about it' },
        ],
      },
    ],
  },
  {
    id: 'programmer',
    title: 'as a programmer',
    accent: 'var(--android-green-strong)',
    items: [
      { id: 'programmer-local-ai', text: 'help us develop local ai models' },
      { id: 'programmer-open-store', text: 'help design the open app store flow' },
      { id: 'programmer-review', text: 'review the approach and point out weak assumptions' },
    ],
  },
  {
    id: 'artist',
    title: 'as an artist',
    accent: 'var(--rose)',
    items: [
      { id: 'artist-meme', text: 'make a meme about phones belonging to the people who bought them' },
      { id: 'artist-poster', text: 'make a poster or tiny graphic people can share' },
      { id: 'artist-explain', text: 'draw the difference between safety and control' },
    ],
  },
  {
    id: 'online-accounts',
    title: 'on online accounts',
    accent: '#7f68b5',
    items: [
      { id: 'accounts-bio', text: 'add the link to one public bio' },
      { id: 'accounts-post', text: 'make one short post about why open android matters' },
      { id: 'accounts-reply', text: 'reply to a relevant thread with the link and a kind explanation' },
    ],
  },
  {
    id: 'tech-exec',
    title: 'as a tech exec',
    accent: '#27856f',
    items: [
      { id: 'tech-exec-remember', text: 'remember what life was like growing up' },
      { id: 'tech-exec-open-path', text: 'ask whether your team can support open paths instead of identity gates' },
      { id: 'tech-exec-defaults', text: 'treat root access and local ai as normal consumer rights' },
    ],
  },
  {
    id: 'future',
    title: 'in the future',
    accent: '#c88317',
    items: [
      { id: 'future-repairable-phone', text: 'switch to a repairable phone with a removable battery' },
      { id: 'future-cyberdeck', text: 'build your own cyberdeck' },
      { id: 'future-choose-devices', text: "choose devices that choose you" },
      { id: 'future-expect-root', text: 'expect root access and local ai as a standard consumer right' },
      { id: 'future-mentor', text: "become the mentor who shows someone else what's possible" },
    ],
  },
];

function itemKey(groupId: string, itemId: string) {
  return `${groupId}:${itemId}`;
}

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The checklist still works if storage is unavailable.
  }
}

function normalizeTaskText(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

function flattenItems(items: ChecklistItem[]): ChecklistItem[] {
  return items.flatMap((item) => [item, ...flattenItems(item.children ?? [])]);
}

function markdownForGroup(group: ChecklistGroup, checked: Record<string, boolean>) {
  const lines = [`- [${checked[group.id] ? 'x' : ' '}] ${normalizeTaskText(group.title)}`];

  const appendItem = (item: ChecklistItem, depth: number) => {
    const key = itemKey(group.id, item.id);
    lines.push(`${'  '.repeat(depth)}- [${checked[key] ? 'x' : ' '}] ${normalizeTaskText(item.text)}`);
    item.children?.forEach((child) => appendItem(child, depth + 1));
  };

  group.items.forEach((item) => appendItem(item, 1));
  return lines.join('\n');
}

function markdownForGroups(groups: ChecklistGroup[], checked: Record<string, boolean>) {
  return groups.map((group) => markdownForGroup(group, checked)).join('\n\n');
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

async function fetchRepresentativeSelections(): Promise<RepresentativeSelections> {
  const [seedResponse, visitorResponse] = await Promise.all([
    fetch('/api/representatives/top?mode=seed'),
    fetch('/api/representatives/me'),
  ]);

  if (!seedResponse.ok || !visitorResponse.ok) throw new Error('could not load people picks');

  const seed = (await seedResponse.json()) as { representatives: Representative[] };
  const visitor = (await visitorResponse.json()) as {
    starredQid: string | null;
    upvotedQids: string[];
    extras: Representative[];
  };
  const rowsByQid = new Map([...seed.representatives, ...visitor.extras].map((row) => [row.qid, row]));
  const starred = visitor.starredQid ? rowsByQid.get(visitor.starredQid) ?? null : null;
  const upvoted = visitor.upvotedQids
    .filter((qid) => qid !== visitor.starredQid)
    .map((qid) => rowsByQid.get(qid))
    .filter((row): row is Representative => Boolean(row));

  return { starred, upvoted };
}

async function fetchEventInterest(): Promise<EventInterestSnapshot> {
  const response = await fetch('/api/event-interest');
  if (!response.ok) throw new Error('could not load event interest');
  const state = (await response.json()) as EventInterestSnapshot;
  return { joined: state.joined };
}

function dynamicReachItems(selections: RepresentativeSelections): ChecklistItem[] {
  const people: ChecklistItem[] = [];

  if (selections.starred) {
    people.push({
      id: `reach-starred-${selections.starred.qid}`,
      text: `reach out to the person you starred: ${selections.starred.label}`,
    });
  }

  selections.upvoted.forEach((person) => {
    people.push({
      id: `reach-upvoted-${person.qid}`,
      text: `reach out to a person you upvoted: ${person.label}`,
    });
  });

  if (people.length === 0) {
    return [
      {
        id: 'reach-pick-someone',
        text: 'star or upvote someone in the people list above',
      },
    ];
  }

  return people;
}

export default function ActionChecklist() {
  const stored = useMemo(() => readJson<StoredChecklist>(CHECKLIST_STORAGE_KEY), []);
  const [checked, setChecked] = useState<Record<string, boolean>>(stored?.checked ?? {});
  const [representatives, setRepresentatives] = useState<RepresentativeSelections>(() => readJson<RepresentativeSelections>(REPRESENTATIVE_SELECTIONS_KEY) ?? { starred: null, upvoted: [] });
  const [eventInterest, setEventInterest] = useState<EventInterestSnapshot>(() => readJson<EventInterestSnapshot>(EVENT_INTEREST_KEY) ?? { joined: false });
  const [copiedGroupId, setCopiedGroupId] = useState<string | null>(null);
  const [copiedFullList, setCopiedFullList] = useState(false);

  useEffect(() => {
    writeJson(CHECKLIST_STORAGE_KEY, { checked });
  }, [checked]);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([fetchRepresentativeSelections(), fetchEventInterest()])
      .then(([representativeResult, eventResult]) => {
        if (cancelled) return;
        if (representativeResult.status === 'fulfilled') setRepresentatives(representativeResult.value);
        if (eventResult.status === 'fulfilled') setEventInterest(eventResult.value);
      });

    const onRepresentativeSelections = (event: Event) => {
      setRepresentatives((event as CustomEvent<RepresentativeSelections>).detail);
    };
    const onEventInterest = (event: Event) => {
      setEventInterest((event as CustomEvent<EventInterestSnapshot>).detail);
    };

    window.addEventListener('hsa:representative-selections', onRepresentativeSelections);
    window.addEventListener('hsa:event-interest', onEventInterest);

    return () => {
      cancelled = true;
      window.removeEventListener('hsa:representative-selections', onRepresentativeSelections);
      window.removeEventListener('hsa:event-interest', onEventInterest);
    };
  }, []);

  const groups = useMemo<ChecklistGroup[]>(() => {
    const dynamicGroups: ChecklistGroup[] = [
      ...(eventInterest.joined
        ? [
            {
              id: 'event-calendar',
              title: 'event invite',
              accent: 'var(--android-green-strong)',
              items: [{ id: 'event-calendar-add', text: 'add helpsaveandroid.io to your calendar' }],
            },
          ]
        : []),
      {
        id: 'reach-out',
        title: 'reach out to',
        accent: '#2f86b7',
        items: dynamicReachItems(representatives),
      },
    ];

    return [...dynamicGroups, ...baseGroups];
  }, [eventInterest.joined, representatives]);

  const setGroupChecked = (group: ChecklistGroup, value: boolean) => {
    const keys = flattenItems(group.items).map((item) => itemKey(group.id, item.id));
    setChecked((current) => ({
      ...current,
      [group.id]: value,
      ...Object.fromEntries(keys.map((key) => [key, value])),
    }));
  };

  const setItemChecked = (group: ChecklistGroup, item: ChecklistItem, value: boolean) => {
    const keys = [itemKey(group.id, item.id), ...flattenItems(item.children ?? []).map((child) => itemKey(group.id, child.id))];
    setChecked((current) => ({
      ...current,
      ...Object.fromEntries(keys.map((key) => [key, value])),
    }));
  };

  const copyGroup = async (group: ChecklistGroup) => {
    await copyText(markdownForGroup(group, checked));
    setCopiedGroupId(group.id);
    window.setTimeout(() => setCopiedGroupId((current) => (current === group.id ? null : current)), 1400);
  };

  const copyFullList = async () => {
    await copyText(markdownForGroups(groups, checked));
    setCopiedFullList(true);
    window.setTimeout(() => setCopiedFullList(false), 1400);
  };

  const renderItem = (group: ChecklistGroup, item: ChecklistItem, depth = 0) => {
    const key = itemKey(group.id, item.id);
    const active = Boolean(checked[key]);

    return (
      <li key={item.id} className={depth > 0 ? 'ml-8 border-l border-dashed border-(--line) pl-4' : ''}>
        <label className="grid cursor-pointer grid-cols-[1.2rem_minmax(0,1fr)] items-start gap-3 py-1 text-[clamp(1.05rem,1.28vw,1.18rem)] leading-relaxed text-(--ink)">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setItemChecked(group, item, event.currentTarget.checked)}
            className={checkboxClassName}
          />
          <span className={active ? 'text-(--muted) line-through decoration-(--accent-strong) decoration-2 underline-offset-4' : ''}>
            {normalizeTaskText(item.text)}
          </span>
        </label>
        {item.children && <ul className="grid gap-0.5">{item.children.map((child) => renderItem(group, child, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <section
      className="my-16 lg:-ml-20 lg:w-[calc(100%+10rem)]"
      aria-label="help checklist"
    >
      <div className="rounded-lg border border-(--line) bg-(--paper) px-4 py-5 shadow-[0_0.6rem_1.4rem_var(--page-shadow)] sm:px-6 sm:py-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-[clamp(1.05rem,1.28vw,1.18rem)] font-semibold leading-relaxed text-(--ink)">
            you can help by, ideally, doing things that you find fun.
          </h2>
          <button
            type="button"
            onClick={copyFullList}
            className="action-checklist-copy-button action-checklist-copy-button--full"
          >
            {copiedFullList ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copiedFullList ? 'copied list' : 'copy full list'}
          </button>
        </div>

        <div className="grid gap-5">
          {groups.map((group) => {
            const active = Boolean(checked[group.id]);
            const groupCheckboxId = `action-checklist-${group.id}`;

            return (
              <div key={group.id} className="group">
                <div className="grid grid-cols-[1.25rem_minmax(0,max-content)_auto] items-start gap-3">
                  <input
                    id={groupCheckboxId}
                    type="checkbox"
                      checked={active}
                      onChange={(event) => setGroupChecked(group, event.currentTarget.checked)}
                      className={checkboxClassName}
                    />
                  <label htmlFor={groupCheckboxId} className="min-w-0 cursor-pointer">
                      <span
                        className={[
                          'inline border-b-[0.28rem] pb-px pr-1 text-[clamp(1.05rem,1.28vw,1.18rem)] font-semibold leading-relaxed text-(--ink)',
                          active ? 'text-(--muted) line-through decoration-(--accent-strong) decoration-2' : '',
                        ].join(' ')}
                      style={{ borderColor: group.accent }}
                    >
                      {normalizeTaskText(group.title)}
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => copyGroup(group)}
                    className="action-checklist-copy-button action-checklist-copy-button--icon mt-1 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                    aria-label={`copy ${group.title}`}
                    title={`copy ${group.title}`}
                  >
                    {copiedGroupId === group.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  </button>
                </div>

                <ul className="mt-2 grid gap-0.5 pl-8">
                  {group.items.map((item) => renderItem(group, item))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
