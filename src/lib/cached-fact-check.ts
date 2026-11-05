import "server-only";
import { createHash } from "node:crypto";
import { cacheLife } from "next/cache";
import { factCheck, type FactCheckResult } from "./fact-check";
import { LINK_PATTERN } from "./links";
import { redis } from "./redis";

// Viral forwards get checked again and again, so the same message returns the stored result
// instead of running the whole pipeline. Two layers:
// - Redis, shared by every server, so a check done once is instant for everyone after.
// - In-memory 'use cache', which also merges identical requests that arrive at the same moment.
export async function checkMessage(message: string): Promise<FactCheckResult> {
  const normalised = normaliseMessage(message);
  if (!redis) return cachedFactCheck(normalised);

  const key = sharedCacheKey(normalised);
  const stored = await redis.get<FactCheckResult>(key).catch((err) => {
    console.error("shared cache read failed", err);
    return null;
  });
  if (stored) return stored;

  const result = await cachedFactCheck(normalised);
  await redis.set(key, result, { ex: lifetimeFor(result).revalidate }).catch((err) => {
    console.error("shared cache write failed", err);
  });
  return result;
}

async function cachedFactCheck(message: string): Promise<FactCheckResult> {
  "use cache";
  const result = await factCheck(message);
  cacheLife(lifetimeFor(result));
  return result;
}

// Each deploy gets its own keys, so changes to prompts or result shape never serve old answers.
const DEPLOYMENT = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

function sharedCacheKey(normalised: string) {
  return `result:${DEPLOYMENT}:${createHash("sha256").update(normalised).digest("hex")}`;
}

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

// Settled verdicts rarely change, but "too recent" or "no reports yet" can change within hours
// once news coverage appears. In memory, after `revalidate` the next request still gets the stored
// answer while a fresh check runs in the background; after `expire`, it waits for a fresh check.
// Redis keeps entries for the `revalidate` period.
function lifetimeFor(result: FactCheckResult) {
  const stillDeveloping =
    result.verdict === "unverifiable" &&
    (result.unverifiableReason === "too_recent" || result.unverifiableReason === "no_evidence");
  return stillDeveloping ? { revalidate: HOUR, expire: 2 * HOUR } : { revalidate: 3 * DAY, expire: 7 * DAY };
}

// Forwards of the same message differ in small ways: WhatsApp's *bold* and _italic_ markers,
// emojis, extra spaces and line breaks. Strip those so they share one cache entry. The result is
// also what gets checked, so only remove things that don't change the meaning. Links are kept
// exactly as they are: their paths are case-sensitive and often contain underscores.
export function normaliseMessage(message: string) {
  return message
    .normalize("NFC")
    .split(new RegExp(`(${LINK_PATTERN.source})`, "gi"))
    .map((part, i) => (i % 2 === 1 ? part : normaliseText(part)))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseText(text: string) {
  return text
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "") // zero-width characters
    .replace(/\p{Extended_Pictographic}|\uFE0F|[\u{1F1E6}-\u{1F1FF}]/gu, "") // emojis and flags
    .replace(/[*_~]/g, "") // WhatsApp formatting
    .toLowerCase();
}
