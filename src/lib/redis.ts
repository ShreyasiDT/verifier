import "server-only";
import { Redis } from "@upstash/redis";

// Shared storage for rate limits and cached results. Set up on Vercel through the Upstash
// integration, which adds the keys below. When they're missing (e.g. `pnpm dev` on a laptop) this
// is null and callers fall back to in-memory behaviour.
const configured =
  (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
  (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN);

export const redis = configured ? Redis.fromEnv() : null;
