import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { seedRepresentativeByQid } from '@/data/representatives';
import { candidateExists } from '@/lib/representatives/db';
import { renderSafeGfm } from '@/lib/representatives/markdown';
import { envBindings, json, noStoreHeaders, normalizedQids, readJsonBody } from '@/lib/representatives/http';
import { fetchWikidataDetailsBatch } from '@/lib/representatives/wikidata';

type EligibilityBody = {
  qids?: unknown;
};

export const POST: APIRoute = async ({ request }) => {
  const body = await readJsonBody<EligibilityBody>(request);
  const qids = normalizedQids(body?.qids);
  const bindings = envBindings(env);
  const detailsByQid = await fetchWikidataDetailsBatch(qids, bindings.HSA_WIKIDATA_CACHE);

  const results = await Promise.all(
    qids.map(async (qid) => {
      const details = detailsByQid.get(qid);
      const [blockedReason, known, statusMarkdown] = await Promise.all([
        bindings.HSA_BLOCKED_QIDS.get(qid),
        candidateExists(bindings.HSA_VOTES_DB, qid),
        bindings.HSA_REP_STATUS.get(qid),
      ]);
      const seed = seedRepresentativeByQid.get(qid);

      return {
        qid,
        eligible: Boolean(details),
        label: details?.label ?? null,
        description: details?.description ?? null,
        entityKind: details?.entityKind ?? null,
        blocked: Boolean(blockedReason),
        known,
        blockHtml: renderSafeGfm(blockedReason),
        statusHtml: renderSafeGfm(statusMarkdown || seed?.fallbackStatus || ''),
      };
    }),
  );

  return json(
    {
      results,
    },
    {
      headers: noStoreHeaders(),
    },
  );
};
