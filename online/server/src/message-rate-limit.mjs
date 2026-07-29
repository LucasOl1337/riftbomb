const DEFAULT_CAPACITY = 240;
const DEFAULT_REFILL_PER_SECOND = 120;

export function createMessageRateLimiter({
  capacity = DEFAULT_CAPACITY,
  refillPerSecond = DEFAULT_REFILL_PER_SECOND,
  now = () => performance.now()
} = {}) {
  if (!(capacity > 0) || !(refillPerSecond > 0)) {
    throw new RangeError("message rate limits must be positive");
  }

  const refillPerMillisecond = refillPerSecond / 1000;
  const buckets = new WeakMap();

  return function allowMessage(socket) {
    const currentTime = now();
    let bucket = buckets.get(socket);
    if (!bucket) {
      buckets.set(socket, { tokens: capacity - 1, updatedAt: currentTime });
      return true;
    }

    const elapsed = Math.max(0, currentTime - bucket.updatedAt);
    if (elapsed > 0) {
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMillisecond);
      bucket.updatedAt = currentTime;
    }
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  };
}
