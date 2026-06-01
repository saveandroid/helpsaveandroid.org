/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type Env = {
  HSA_VOTES_DB: D1Database;
  HSA_WIKIDATA_CACHE: KVNamespace;
  HSA_REP_STATUS: KVNamespace;
  HSA_BLOCKED_QIDS: KVNamespace;
  TURNSTILE_SECRET_KEY?: string;
  HSA_COOKIE_SECRET: string;
  HSA_EVENT_NOTIFY_SECRET?: string;
  HSA_WEB_PUSH_PUBLIC_KEY?: string;
  HSA_WEB_PUSH_PRIVATE_KEY?: string;
  HSA_WEB_PUSH_SUBJECT?: string;
  PUBLIC_TURNSTILE_SITE_KEY?: string;
};
