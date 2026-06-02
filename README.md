# helpsaveandroid.org

android can be safer without becoming smaller.

this repo is the site for helpsaveandroid.org: a public campaign page, a small set of interactive calls to action, and the early technical pieces around representative voting, event interest, and open app discovery.

the project is intentionally plain. the page should feel like a note that people can read, share, and help improve; the code should stay easy to understand for the next person who opens it.

## what is here

```text
/
├── migrations/                 d1 schema for votes and event interest
├── public/                     static files and generated people search data
├── src/
│   ├── assets/                 page images imported by astro
│   ├── components/             astro and react islands used by the page
│   ├── data/                   seed representatives and filtering metadata
│   ├── lib/                    cloudflare, voting, people search, and api helpers
│   ├── pages/                  the homepage and api routes
│   ├── styles/                 global page styles
│   ├── test/                   vitest coverage for the shared logic
│   └── worker.ts               cloudflare worker entrypoint and scheduled jobs
├── astro.config.mjs            astro, cloudflare, react, tailwind, and fonts
├── package.json                scripts and dependency versions
└── wrangler.jsonc              cloudflare bindings, routes, cron, and deploy config
```

the homepage lives in `src/pages/index.astro`. keep the visible campaign wording close to the source draft when changing copy, and preserve the page's deliberate pauses and spacing.

## local setup

use node `22.12.0` or newer and pnpm.

```sh
pnpm install
pnpm dev
```

the dev server opens the astro site locally. static page work is usually fine there.

for code paths that need cloudflare bindings, use the worker-shaped environment from wrangler instead:

```sh
pnpm build
pnpm wrangler dev
```

## common commands

| command | what it does |
| --- | --- |
| `pnpm dev` | start the astro dev server |
| `pnpm build` | build the cloudflare server output into `dist/` |
| `pnpm preview` | preview the built site locally |
| `pnpm test` | run the vitest suite |
| `pnpm deploy` | deploy with wrangler |
| `pnpm astro ...` | run astro cli commands |

## cloudflare pieces

the site runs as an astro server app on cloudflare workers.

`wrangler.jsonc` defines:

- `HSA_VOTES_DB`: d1 database used for representative voting and event interest
- `HSA_WIKIDATA_CACHE`: wikidata lookup cache
- `HSA_REP_STATUS`: editable representative status copy
- `HSA_BLOCKED_QIDS`: blocked representative/person qids
- `HSA_SESSION`: astro session storage
- `PUBLIC_TURNSTILE_SITE_KEY`: public turnstile key
- `TURNSTILE_SECRET_KEY`: secret turnstile key
- `HSA_COOKIE_SECRET`: secret used to sign visitor cookies
- a scheduled job that refreshes representative counts every three hours

do not commit secret values. local secrets belong in wrangler's local secret flow or your local cloudflare environment.

## data and migrations

d1 migrations are in `migrations/`.

```sh
pnpm wrangler d1 migrations apply hsa-votes --local
pnpm wrangler d1 migrations apply hsa-votes --remote
```

the first migration creates representative candidates, upvotes, stars, and cached counts. the second migration creates event interest state and aggregate counts. the third migration creates event push notification subscriptions.

representative seed data appears in both `migrations/0001_representative_votes.sql` and `src/data/representatives.ts`. if a seed representative changes, keep those two sources in sync.

## api routes

the public api routes live under `src/pages/api/`.

representatives:

- `GET /api/representatives/top`
- `GET /api/representatives/me`
- `GET /api/representatives/search`
- `GET /api/representatives/candidates`
- `GET /api/representatives/eligibility`
- `POST /api/representatives/upvote`
- `POST /api/representatives/star`

event interest:

- `GET /api/event-interest`
- `PUT /api/event-interest`
- `GET /api/event-interest/push-public-key`
- `POST /api/event-interest/push-subscription`
- `DELETE /api/event-interest/push-subscription`
- `POST /api/event-interest/notify`

turnstile is enforced on write routes. visitor state is keyed through a signed cookie, then stored as a hash so the app can count support without asking people to log in.

## event browser notifications

the event interest ticket can register browser push notifications after signup. generate keys once:

```sh
pnpm vapid:generate
```

set the resulting values as cloudflare secrets:

```sh
wrangler secret put HSA_WEB_PUSH_PUBLIC_KEY
wrangler secret put HSA_WEB_PUSH_PRIVATE_KEY
wrangler secret put HSA_EVENT_NOTIFY_SECRET
```

`HSA_WEB_PUSH_SUBJECT` is optional and defaults to `mailto:hello@helpsaveandroid.org`.
for local testing, put the same values in `.dev.vars`; without `HSA_WEB_PUSH_PUBLIC_KEY`, the ticket will still save interest but will not prompt for browser notifications.

after running d1 migrations and deploying, send a notification with:

```sh
curl -X POST https://helpsaveandroid.org/api/event-interest/notify \
  -H "Authorization: Bearer $HSA_EVENT_NOTIFY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"title":"event update","body":"we have news about the online event","url":"/#event"}'
```

## code map

- `src/components/representative-voting.tsx` is the representative voting island.
- `src/components/event-interest-invite.tsx` is the event interest island.
- `src/components/open-app-showcase.astro` is the open app section.
- `src/lib/representatives/db.ts` owns representative d1 reads and writes.
- `src/lib/event-interest/db.ts` owns event interest d1 reads and writes.
- `src/lib/event-interest/push-db.ts` owns event interest push subscription d1 reads and writes.
- `src/lib/event-interest/web-push.ts` signs and sends event browser notifications.
- `src/lib/representatives/wikidata.ts` resolves and validates wikidata candidates.
- `src/lib/people/search.ts` and `src/lib/people/normalise.ts` power local people search.
- `src/worker.ts` wires astro request handling and the scheduled count refresh.

## style notes

the public page has a particular voice: direct, human, a little informal, and not over-polished.

when changing the site:

- keep the campaign page readable before it is clever
- prefer small components over clever abstractions
- preserve existing copy rhythm unless the task is explicitly to rewrite it
- use the shared css tokens and type classes from `src/styles/global.css`
- keep api responses small, explicit, and easy for the front end to recover from
- add tests when changing voting, cookies, people search, markdown rendering, or wikidata logic

## testing

```sh
pnpm test
pnpm build
```

`pnpm test` covers the core representative, cookie, markdown, wikidata, people search, and event interest logic. `pnpm build` is the broader check that astro, cloudflare bindings, imports, and page rendering still fit together.

## deployment

```sh
pnpm build
pnpm deploy
```

the worker route is configured for `helpsaveandroid.org` in `wrangler.jsonc`. preview urls and workers.dev are disabled in the checked-in config.
