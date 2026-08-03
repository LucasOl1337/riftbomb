import { performance } from "node:perf_hooks";

export const DEFAULT_HEALTH_RESPONSE_TTL_MS = 100;

export function createEventLoopUtilizationSampler(read = () => performance.eventLoopUtilization()) {
  if (typeof read !== "function") throw new TypeError("read must be a function");

  let previous = null;
  return () => {
    const current = read();
    // The first sample has no earlier point; subsequent samples describe only
    // the interval since the last health collection.
    const active = previous === null ? current.active : current.active - previous.active;
    const idle = previous === null ? current.idle : current.idle - previous.idle;
    previous = current;
    const total = active + idle;
    const utilization = total > 0 ? active / total : current.utilization;
    return Number(utilization.toFixed(4));
  };
}

export function createHealthResponseCache(collect, {
  ttlMs = DEFAULT_HEALTH_RESPONSE_TTL_MS,
  now = () => performance.now()
} = {}) {
  if (typeof collect !== "function") throw new TypeError("collect must be a function");
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RangeError("ttlMs must be a positive finite number");
  }

  let cachedBody = null;
  let expiresAt = -Infinity;
  return () => {
    const currentTime = now();
    if (cachedBody !== null && currentTime < expiresAt) return cachedBody;
    cachedBody = JSON.stringify(collect());
    expiresAt = currentTime + ttlMs;
    return cachedBody;
  };
}
