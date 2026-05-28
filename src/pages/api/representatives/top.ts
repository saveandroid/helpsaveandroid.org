import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { envBindings, json } from '@/lib/representatives/http';
import { getSeedRepresentatives, getTopRepresentatives } from '@/lib/representatives/db';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const cacheKey = new Request(url.toString(), { method: 'GET' });

  try {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
  } catch {
    // Cache API may be unavailable in some local test runners.
  }

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 10) || 10, 1), 200);
  const rows =
    url.searchParams.get('mode') === 'seed'
      ? await getSeedRepresentatives(envBindings(env))
      : await getTopRepresentatives(envBindings(env), limit);
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
