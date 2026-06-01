# Astro Starter Kit: Minimal

```sh
pnpm create astro@latest -- --template minimal
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `pnpm install`             | Installs dependencies                            |
| `pnpm dev`             | Starts local dev server at `localhost:4321`      |
| `pnpm build`           | Build your production site to `./dist/`          |
| `pnpm preview`         | Preview your build locally, before deploying     |
| `pnpm vapid:generate`  | Generate Web Push VAPID keys                     |
| `pnpm astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `pnpm astro -- --help` | Get help using the Astro CLI                     |

## Event Browser Notifications

The event interest ticket can register browser push notifications after signup. Generate keys once:

```sh
pnpm vapid:generate
```

Set the resulting values as Cloudflare secrets:

```sh
wrangler secret put HSA_WEB_PUSH_PUBLIC_KEY
wrangler secret put HSA_WEB_PUSH_PRIVATE_KEY
wrangler secret put HSA_EVENT_NOTIFY_SECRET
```

`HSA_WEB_PUSH_SUBJECT` is optional and defaults to `mailto:hello@helpsaveandroid.org`.
For local testing, put the same values in `.dev.vars`; without `HSA_WEB_PUSH_PUBLIC_KEY`, the ticket will still save interest but will not prompt for browser notifications.

After running D1 migrations and deploying, send a notification with:

```sh
curl -X POST https://helpsaveandroid.org/api/event-interest/notify \
  -H "Authorization: Bearer $HSA_EVENT_NOTIFY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"title":"event update","body":"we have news about the online event","url":"/#event"}'
```

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
