import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { envBindings, json } from '@/lib/representatives/http';
import { getTopRepresentatives } from '@/lib/representatives/db';

export const GET: APIRoute = async ({ request }) => {
  const cacheUrl = new URL(request.url);
  cacheUrl.search = '';
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  try {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
  } catch {
    // Cache API may be unavailable in some local test runners.
  }

  const rows = await getTopRepresentatives(envBindings(env));
  const response = json(
    {
      representatives: rows,
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    },
  );

  try {
    await caches.default.put(cacheKey, response.clone());
  } catch {
    // The response is still correct without the edge cache.
  }

  return response;
};
