import { isValidQid } from '@/data/representatives';
import type { EnvBindings } from './db';

export function json(data: unknown, init: ResponseInit = {}, setCookie?: string): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (setCookie) headers.append('Set-Cookie', setCookie);
  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function normalizedQids(value: unknown, max = 25): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((qid): qid is string => typeof qid === 'string' && isValidQid(qid)))].slice(0, max);
}

export function envBindings(env: Env): EnvBindings {
  return env as EnvBindings;
}

export function noStoreHeaders(): HeadersInit {
  return {
    'Cache-Control': 'private, no-store',
  };
}
