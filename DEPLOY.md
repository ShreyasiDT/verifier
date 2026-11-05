# Deploying Verifier

Verifier runs on [Vercel](https://vercel.com) with [Upstash Redis](https://upstash.com) for the shared
result cache and rate limits. Both have free plans; Vercel's free plan is for personal, non-commercial use.

## One-time setup

1. **Import the repo.** Sign in to Vercel with GitHub, choose **Add New → Project**, and import
   `ShreyasiDT/Verifier`. Leave the framework (Next.js) and build settings as detected.
2. **Add Redis.** In the project, open **Storage → Marketplace → Upstash → Redis**, pick the free plan
   and connect it to this project. Vercel adds the Redis keys to the project's environment variables.
3. **Add the API keys.** In **Settings → Environment Variables**, add these for **Production** (and
   **Preview** if you want preview deployments to work). Copy the values from your local `.env.local`;
   never commit them.

   | Variable | What it is |
   |---|---|
   | `CHATGPT_PROXY_API_KEY` | LLM proxy key |
   | `CHATGPT_PROXY_BASE_URL` | LLM proxy URL (kept out of the repo on purpose) |
   | `LLM_MODEL` | Model name, e.g. `gpt-6-luna` |
   | `EXA_API_KEY` | Exa web search |
   | `GOOGLE_FACT_CHECK_API_KEY` | Google Fact Check Tools API |

4. **Deploy.** Trigger a deployment (or push to `main`). Vercel gives you a link like
   `verifier-xxxx.vercel.app`.

After that, every push to `main` deploys automatically.

## Checking a deployment

- Open the link and check a message; the first check takes 15–30 seconds.
- Check the exact same message again: it should come back almost instantly (from the Redis cache).
- In **Logs**, a check shows `[timing]` lines per step; errors show as `fact-check failed`.

## Running locally

Create `.env.local` (it's git-ignored) with the five variables from the table above, then run
`pnpm dev`. Redis is optional locally: add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
to test rate limits and the shared cache, or leave them out to run without either.

## Limits

Set in `src/lib/rate-limit.ts`:

- Per visitor (by IP): 10 checks per 10 minutes, 50 per day.
- Whole app: 1,000 checks per day — a ceiling on daily API costs.

Without Redis (e.g. `pnpm dev` locally) there are no limits and caching is per server process.

## Things to know

- The LLM proxy must accept requests from Vercel's servers. If it only allows certain networks,
  checks will fail with "Something went wrong" and `fact-check failed` in the logs.
- Cached results are tied to a deployment, so each deploy starts with an empty cache.
- Images are shrunk in the browser before upload; the server accepts up to 4 MB (Vercel's request
  limit is 4.5 MB).
