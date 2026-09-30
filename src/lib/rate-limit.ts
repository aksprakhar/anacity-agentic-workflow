// In-memory fixed-window limiter. Each server instance keeps its own counts,
// so this is a demo-grade guard against casual abuse, not a shared quota.
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function check(key: string, now = Date.now()) {
    if (hits.size > 5000)
      for (const [entry, value] of hits)
        if (value.resetAt <= now) hits.delete(entry);
    const current = hits.get(key);
    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfter: 0 };
    }
    if (current.count >= limit)
      return {
        allowed: false,
        retryAfter: Math.ceil((current.resetAt - now) / 1000),
      };
    current.count += 1;
    return { allowed: true, retryAfter: 0 };
  };
}

export function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
