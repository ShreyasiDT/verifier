"use client";

import { useState } from "react";
import type { ClaimCheck, FactCheckResult, UnverifiableReason, Verdict } from "@/lib/fact-check";
import { getLabels } from "@/lib/labels";

const VERDICT_STYLES: Record<Verdict, { icon: string; className: string }> = {
  true: {
    icon: "✅",
    className: "border-green-600 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100",
  },
  false: {
    icon: "❌",
    className: "border-red-600 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
  },
  misleading: {
    icon: "⚠️",
    className: "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  },
  unverifiable: {
    icon: "❓",
    className: "border-zinc-500 bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100",
  },
};

const REASON_ICONS: Record<UnverifiableReason, string> = {
  local_news: "📍",
  too_recent: "🕒",
  no_evidence: "🚩",
  conflicting_sources: "⚖️",
  not_a_fact: "💬",
};

// A big claim with no coverage is a warning sign, so it looks like "misleading" rather than neutral.
function cardStyle(result: FactCheckResult) {
  if (result.unverifiableReason === "no_evidence") {
    return { icon: VERDICT_STYLES.unverifiable.icon, className: VERDICT_STYLES.misleading.className };
  }
  return VERDICT_STYLES[result.verdict];
}

export function FactChecker() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FactCheckResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label htmlFor="message" className="text-lg font-medium">
          Paste the message you received
        </label>
        <textarea
          id="message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder="e.g. Government is giving ₹5000 to every citizen, apply before Friday…"
          className="w-full rounded-xl border border-zinc-300 bg-white p-4 text-lg dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={loading || text.trim().length < 10}
          className="h-14 rounded-xl bg-foreground text-lg font-semibold text-background disabled:opacity-40"
        >
          {loading ? "Checking… this can take up to a minute" : "Check this message"}
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-xl border border-red-600 p-4 text-lg text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {result && <ResultCard result={result} />}
    </div>
  );
}

function ResultCard({ result }: { result: FactCheckResult }) {
  const style = cardStyle(result);
  const labels = getLabels(result.languageCode);
  const factCheckUrls = new Set(result.factCheckedBy.map((f) => f.url));
  return (
    <section className={`flex flex-col gap-4 rounded-2xl border-2 p-6 ${style.className}`}>
      <h2 className="text-3xl font-bold">
        {style.icon} {labels.verdict[result.verdict]}
      </h2>
      <p className="text-xl font-semibold">
        {result.unverifiableReason && <span aria-hidden>{REASON_ICONS[result.unverifiableReason]} </span>}
        {result.headline}
      </p>
      {result.factCheckedBy.length > 0 && (
        <p className="text-base">
          <span aria-hidden>✔ </span>
          {labels.alreadyCheckedBy}{" "}
          <span className="font-semibold">{[...new Set(result.factCheckedBy.map((f) => f.publisher))].join(", ")}</span>
        </p>
      )}
      <details className="group rounded-xl border border-current/30 bg-white/50 dark:bg-black/20">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
          {labels.why[result.verdict]}
          <span aria-hidden className="text-2xl transition-transform group-open:rotate-180">
            ⌄
          </span>
        </summary>
        <div className="flex flex-col gap-4 px-4 pb-4">
          {result.claims.length === 1 ? (
            <ClaimDetails claim={result.claims[0]} labels={labels} />
          ) : (
            // Several claims: show each one with its own verdict so readers see which part is wrong.
            result.claims.map((claim, i) => (
              <div key={i} className="flex flex-col gap-3 border-t border-current/20 pt-4 first:border-t-0 first:pt-0">
                <p className="text-lg font-semibold">
                  {VERDICT_STYLES[claim.verdict].icon} {labels.verdict[claim.verdict]} — {claim.headline}
                </p>
                <ClaimDetails claim={claim} labels={labels} />
              </div>
            ))
          )}
        </div>
      </details>
      {result.sources.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">{labels.sources}</h3>
          <ul className="flex flex-col gap-2">
            {result.sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg underline underline-offset-4 break-words"
                >
                  {s.title}
                </a>
                <span className="block text-sm opacity-70">
                  {new URL(s.url).hostname}
                  {factCheckUrls.has(s.url) && (
                    <span className="ml-2 rounded-full border border-current px-2 py-0.5 text-xs font-semibold">
                      {labels.factCheckTag}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ClaimDetails({ claim, labels }: { claim: ClaimCheck; labels: ReturnType<typeof getLabels> }) {
  return (
    <>
      <ul className="flex list-disc flex-col gap-3 pl-6 text-lg leading-relaxed">
        {claim.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="text-base opacity-80">
        <span className="font-semibold">{labels.whatWeChecked}</span> {claim.claim}
      </p>
    </>
  );
}
