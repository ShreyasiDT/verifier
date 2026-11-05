// Runs every message in evals/cases.json through the running app and checks the results.
// Start the dev server first, then: pnpm evals [case-id-filter]
// Calls the real LLM and search APIs, so each run costs a little and results vary slightly.
import { readFile } from "node:fs/promises";

const BASE_URL = process.env.EVAL_URL ?? "http://localhost:3000";
const CONCURRENCY = 4;

const filter = process.argv[2];
const cases = JSON.parse(await readFile(new URL("../evals/cases.json", import.meta.url), "utf8")).filter(
  (c) => !filter || c.id.includes(filter),
);

async function run(testCase) {
  const started = performance.now();
  const res = await fetch(`${BASE_URL}/api/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: testCase.text }),
  });
  const result = await res.json();
  return { testCase, result, seconds: (performance.now() - started) / 1000 };
}

function problems({ expect }, result) {
  if (result.error) return [result.error];
  const found = [];
  if (!expect.verdict.includes(result.verdict)) found.push(`verdict ${result.verdict}, expected ${expect.verdict}`);
  if (expect.reason && !expect.reason.includes(result.unverifiableReason))
    found.push(`reason ${result.unverifiableReason}, expected ${expect.reason}`);
  if (!expect.claims.includes(result.claims.length))
    found.push(`${result.claims.length} claims, expected ${expect.claims}`);
  if (result.languageCode !== expect.language) found.push(`language ${result.languageCode}`);
  // A linked page we read can be the evidence itself (e.g. the video isn't what the message says).
  if (["true", "false"].includes(result.verdict) && result.sources.length + result.articles.length === 0)
    found.push("no sources");
  if (expect.factChecked && result.factCheckedBy.length === 0) found.push("no published fact-check matched");
  if (expect.articles !== undefined && result.articles.length !== expect.articles)
    found.push(`${result.articles.length} linked pages read, expected ${expect.articles}`);
  if (expect.unreadableLinks !== undefined && result.unreadableLinks.length !== expect.unreadableLinks)
    found.push(`${result.unreadableLinks.length} unreadable links, expected ${expect.unreadableLinks}`);
  return found;
}

// Simple worker pool so we don't hit the APIs with every case at once.
const queue = [...cases];
const outcomes = [];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const outcome = await run(queue.shift());
      outcome.problems = problems(outcome.testCase, outcome.result);
      outcomes.push(outcome);
      const { testCase, result, seconds } = outcome;
      const status = outcome.problems.length === 0 ? "PASS" : "FAIL";
      const checkedBy = result.factCheckedBy?.length ? ` ✔ ${result.factCheckedBy.map((f) => f.publisher).join(", ")}` : "";
      console.log(`${status} ${testCase.id} (${seconds.toFixed(0)}s): ${result.verdict} | ${result.headline}${checkedBy}`);
      for (const p of outcome.problems) console.log(`      !! ${p}`);
    }
  }),
);

const passed = outcomes.filter((o) => o.problems.length === 0).length;
const times = outcomes.map((o) => o.seconds).sort((a, b) => a - b);
console.log(
  `\n${passed}/${outcomes.length} passed · median ${times[Math.floor(times.length / 2)].toFixed(0)}s · max ${times.at(-1).toFixed(0)}s`,
);
process.exitCode = passed === outcomes.length ? 0 : 1;
