type Entry = { count: number; until: number };
const attempts = new Map<string, Entry>();
const MAX_BUCKETS = 4096;

function prune(now: number) {
  for (const [key, value] of attempts) {
    if (value.until <= now) attempts.delete(key);
  }
  while (attempts.size >= MAX_BUCKETS) {
    const oldest = attempts.keys().next().value as string | undefined;
    if (!oldest) break;
    attempts.delete(oldest);
  }
}

function mapKey(bucket: string, key: string) {
  return `${bucket}:${key.slice(0, 128)}`;
}

export function isRateLimited(bucket: string, key: string, limit: number) {
  const entry = attempts.get(mapKey(bucket, key));
  return Boolean(entry && entry.until > Date.now() && entry.count >= limit);
}

export function registerFailedAttempt(bucket: string, key: string, windowMs: number) {
  const now = Date.now();
  const id = mapKey(bucket, key);
  const previous = attempts.get(id);
  if (!previous || previous.until <= now) {
    prune(now);
    attempts.set(id, { count: 1, until: now + windowMs });
    return;
  }
  previous.count += 1;
  attempts.delete(id);
  attempts.set(id, previous);
}

export function clearFailedAttempts(bucket: string, key: string) {
  attempts.delete(mapKey(bucket, key));
}
