import { isValidQid } from '@/data/representatives';

export type EntityKind = 'human' | 'account' | 'organization';

export type WikidataCandidateDetails = {
  qid: string;
  label: string;
  description: string | null;
  wikidataUrl: string;
  entityKind: EntityKind;
};

type WikidataEntity = {
  id: string;
  labels?: Record<string, { value?: string }>;
  descriptions?: Record<string, { value?: string }>;
  claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: { id?: string } | string } } }>>;
};

const HUMAN_QID = 'Q5';
const ORGANIZATION_QIDS = new Set([
  'Q43229',
  'Q4830453',
  'Q891723',
  'Q163740',
  'Q6881511',
  'Q35127',
]);

const PUBLIC_ACCOUNT_PROPERTIES = new Set([
  'P2002',
  'P2003',
  'P2013',
  'P2397',
  'P2942',
  'P3267',
  'P4033',
  'P4265',
  'P7085',
  'P8687',
]);

const WIKIMEDIA_USER_AGENT = 'helpsaveandroid.org representative voting/1.0 (ideas@helpsaveandroid.org)';
const WIKIDATA_DETAILS_CACHE_PREFIX = 'details:v2:';

function claimEntityIds(entity: WikidataEntity, property: string): string[] {
  return (entity.claims?.[property] ?? [])
    .map((claim) => {
      const value = claim.mainsnak?.datavalue?.value;
      return typeof value === 'object' && value && 'id' in value ? value.id : null;
    })
    .filter((value): value is string => Boolean(value));
}

function hasAnyClaim(entity: WikidataEntity, properties: Set<string>): boolean {
  return Object.keys(entity.claims ?? {}).some((property) => properties.has(property));
}

export function classifyWikidataEntity(entity: WikidataEntity): EntityKind | null {
  const instanceOf = claimEntityIds(entity, 'P31');

  if (instanceOf.includes(HUMAN_QID)) return 'human';
  if (instanceOf.some((qid) => ORGANIZATION_QIDS.has(qid))) return 'organization';
  if (hasAnyClaim(entity, PUBLIC_ACCOUNT_PROPERTIES)) return 'account';

  return null;
}

export function detailsFromWikidataEntity(entity: WikidataEntity): WikidataCandidateDetails | null {
  if (!isValidQid(entity.id)) return null;
  const entityKind = classifyWikidataEntity(entity);
  const label = entity.labels?.en?.value?.trim();
  if (!entityKind || !label) return null;

  return {
    qid: entity.id,
    label,
    description: entity.descriptions?.en?.value?.trim() || null,
    wikidataUrl: `https://www.wikidata.org/wiki/${entity.id}`,
    entityKind,
  };
}

export async function fetchWikidataDetails(qid: string, cache?: KVNamespace): Promise<WikidataCandidateDetails | null> {
  return (await fetchWikidataDetailsBatch([qid], cache)).get(qid) ?? null;
}

export async function fetchWikidataDetailsBatch(qids: string[], cache?: KVNamespace): Promise<Map<string, WikidataCandidateDetails>> {
  const validQids = [...new Set(qids.filter(isValidQid))].slice(0, 25);
  const detailsByQid = new Map<string, WikidataCandidateDetails>();
  const missingQids: string[] = [];

  await Promise.all(
    validQids.map(async (qid) => {
      const cached = await cache?.get<WikidataCandidateDetails>(`${WIKIDATA_DETAILS_CACHE_PREFIX}${qid}`, 'json');
      if (cached) detailsByQid.set(qid, cached);
      else missingQids.push(qid);
    }),
  );

  if (missingQids.length === 0) return detailsByQid;

  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', missingQids.join('|'));
  url.searchParams.set('props', 'labels|descriptions|claims');
  url.searchParams.set('languages', 'en');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  const response = await fetch(url, {
    headers: {
      'User-Agent': WIKIMEDIA_USER_AGENT,
      'Api-User-Agent': WIKIMEDIA_USER_AGENT,
    },
  });

  if (!response.ok) return detailsByQid;
  const payload = (await response.json()) as { entities?: Record<string, WikidataEntity> };

  await Promise.all(
    missingQids.map(async (qid) => {
      const entity = payload.entities?.[qid];
      const details = entity ? detailsFromWikidataEntity(entity) : null;
      if (!details) return;
      detailsByQid.set(qid, details);
      await cache?.put(`${WIKIDATA_DETAILS_CACHE_PREFIX}${qid}`, JSON.stringify(details), { expirationTtl: 60 * 60 * 24 * 14 });
    }),
  );

  return detailsByQid;
}
