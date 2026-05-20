/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type Env = {
  HSA_VOTES_DB: D1Database;
  HSA_WIKIDATA_CACHE: KVNamespace;
  HSA_REP_STATUS: KVNamespace;
  HSA_BLOCKED_QIDS: KVNamespace;
  TURNSTILE_SECRET_KEY?: string;
  HSA_COOKIE_SECRET: string;
  PUBLIC_TURNSTILE_SITE_KEY?: string;
};
