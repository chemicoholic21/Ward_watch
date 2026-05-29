/**
 * Small HTTP helpers for App Router route handlers.
 * Replicates the `res.json({ success, data, error })` shape the Express
 * routes used to return, so the frontend's `lib/api.ts` keeps working unchanged.
 */
import { NextResponse } from 'next/server';

export function ok<T>(data: T, extras: Record<string, unknown> = {}) {
  return NextResponse.json({ success: true, data, ...extras });
}

export function fail(message: string, status = 500, extras: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error: message, ...extras }, { status });
}

export function badRequest(message: string) {
  return fail(message, 400);
}

export function notFound(message = 'Not found') {
  return fail(message, 404);
}

/**
 * Wrap a route handler so any thrown error becomes a 500 with the message body
 * the old Express handlers returned: `{ success: false, error: <message> }`.
 */
export function handler<T extends (...args: any[]) => Promise<Response>>(fn: T): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error: any) {
      console.error('Route error:', error);
      return fail(error?.message ?? 'Internal server error', 500);
    }
  }) as T;
}
