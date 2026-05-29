import { NextRequest, NextResponse } from 'next/server';

/**
 * Replaces the Express `cors()` and `express-rate-limit` middleware.
 *
 * `helmet()`-style security headers are set via `next.config.js` `headers()`
 * instead — that runs on every response (including static assets), which is
 * the right scope for security headers.
 */

const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// In-memory rate-limit bucket. For multi-instance deploys swap this for
// Upstash Redis (`@upstash/ratelimit`) — same `middleware.ts` keeps working.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function rateLimitKey(req: NextRequest) {
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  return `${ip}:${req.nextUrl.pathname.startsWith('/api/') ? 'api' : 'web'}`;
}

function checkRateLimit(req: NextRequest): { ok: true } | { ok: false; retryAfterSec: number } {
  // Only rate-limit /api/* to match the old Express behaviour.
  if (!req.nextUrl.pathname.startsWith('/api/')) return { ok: true };

  const now = Date.now();
  const key = rateLimitKey(req);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }

  if (bucket.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  bucket.count += 1;
  return { ok: true };
}

function applyCors(req: NextRequest, res: NextResponse) {
  const origin = req.headers.get('origin');
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Vary', 'Origin');
    res.headers.set('Access-Control-Allow-Credentials', 'true');
    res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-api-key');
  }
  return res;
}

export function middleware(req: NextRequest) {
  // CORS preflight short-circuit.
  if (req.method === 'OPTIONS' && req.nextUrl.pathname.startsWith('/api/')) {
    return applyCors(req, new NextResponse(null, { status: 204 }));
  }

  const limit = checkRateLimit(req);
  if (!limit.ok) {
    const res = NextResponse.json(
      { error: 'Too many requests, please try again later' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
    return applyCors(req, res);
  }

  return applyCors(req, NextResponse.next());
}

export const config = {
  // Run on every API route + every page, but skip Next internals and assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
