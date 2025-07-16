import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory store (not for production)
const rateLimitStore = new Map<string, { count: number; lastRequest: number }>();
const WINDOW_SIZE = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30; // 30 requests per minute per IP

export function rateLimit(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();
  const entry = rateLimitStore.get(ip) || { count: 0, lastRequest: now };

  if (now - entry.lastRequest > WINDOW_SIZE) {
    entry.count = 1;
    entry.lastRequest = now;
  } else {
    entry.count += 1;
  }

  rateLimitStore.set(ip, entry);

  if (entry.count > MAX_REQUESTS) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  return null; // No rate limit triggered
} 