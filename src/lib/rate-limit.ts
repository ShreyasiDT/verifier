import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis";

// Each check calls the LLM, Exa and Google, so limits protect the bills. Without Redis (local
// development) there's nothing shared to count with, so checks are not limited.
const limiters = redis && {
  burst: new Ratelimit({ redis, prefix: "rl:burst", limiter: Ratelimit.slidingWindow(10, "10 m") }),
  daily: new Ratelimit({ redis, prefix: "rl:daily", limiter: Ratelimit.fixedWindow(50, "1 d") }),
  // One counter for everyone: a hard ceiling on what a day can cost.
  global: new Ratelimit({ redis, prefix: "rl:global", limiter: Ratelimit.fixedWindow(1000, "1 d") }),
};

export type LimitResult = { ok: true } | { ok: false; scope: "person" | "everyone"; retryAfterSeconds: number };

export async function checkRateLimit(ip: string): Promise<LimitResult> {
  if (!limiters) return { ok: true };
  try {
    const [burst, daily, global] = await Promise.all([
      limiters.burst.limit(ip),
      limiters.daily.limit(ip),
      limiters.global.limit("all"),
    ]);
    const blocked = [burst, daily, global].filter((r) => !r.success);
    if (blocked.length === 0) return { ok: true };
    const resetAt = Math.max(...blocked.map((r) => r.reset));
    return {
      ok: false,
      scope: global.success ? "person" : "everyone",
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
    };
  } catch (err) {
    // If Redis is down, let the check through rather than block everyone; the daily cap is a
    // safety net, not something a short outage should turn into a full outage.
    console.error("rate limit check failed", err);
    return { ok: true };
  }
}

// Vercel puts the visitor's address first in x-forwarded-for.
export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
