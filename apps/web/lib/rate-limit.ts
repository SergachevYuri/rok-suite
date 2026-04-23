// Simple per-instance sliding-window rate limiter.
//
// Vercel runs multiple serverless instances, so the effective cap is
// (perInstance * instanceCount). Good enough to bound damage on expensive
// AI-proxy endpoints without pulling in Redis/Upstash.

import { NextRequest } from 'next/server';

type Bucket = { hits: number[]; windowMs: number; limit: number };

const BUCKETS = new Map<string, Bucket>();
const MAX_KEYS = 5000; // cap memory growth on pathological traffic

function prune(bucket: Bucket, now: number) {
  const cutoff = now - bucket.windowMs;
  let i = 0;
  while (i < bucket.hits.length && bucket.hits[i] < cutoff) i++;
  if (i > 0) bucket.hits.splice(0, i);
}

export function getClientIp(req: NextRequest): string {
  // Vercel / proxies set x-forwarded-for
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  let bucket = BUCKETS.get(key);
  if (!bucket) {
    if (BUCKETS.size >= MAX_KEYS) {
      // Drop oldest ~10% to cap memory. Not LRU, but cheap and adequate.
      const drop = Math.floor(MAX_KEYS / 10);
      const iter = BUCKETS.keys();
      for (let i = 0; i < drop; i++) {
        const k = iter.next().value;
        if (k !== undefined) BUCKETS.delete(k);
      }
    }
    bucket = { hits: [], windowMs, limit };
    BUCKETS.set(key, bucket);
  }
  prune(bucket, now);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    return { allowed: false, remaining: 0, resetMs: oldest + windowMs - now };
  }
  bucket.hits.push(now);
  return { allowed: true, remaining: limit - bucket.hits.length, resetMs: windowMs };
}
