import type { ClaimCheck, FactCheckResult, UnverifiableReason, Verdict } from "@/lib/fact-check";
import { getLabels } from "@/lib/labels";
import type { ImageReading } from "@/lib/read-image";

export type CheckResponse = FactCheckResult & { image: ImageReading | null };

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

export function verdictIcon(result: FactCheckResult) {
  return cardStyle(result).icon;
}

// A big claim with no coverage is a warning sign, so it looks like "misleading" rather than neutral.
function cardStyle(result: FactCheckResult) {
  if (result.unverifiableReason === "no_evidence") {
    return { icon: VERDICT_STYLES.unverifiable.icon, className: VERDICT_STYLES.misleading.className };
  }
  return VERDICT_STYLES[result.verdict];
}

export function ResultCard({ result }: { result: CheckResponse }) {
  const style = cardStyle(result);
  const labels = getLabels(result.languageCode);
  const factCheckUrls = new Set(result.factCheckedBy.map((f) => f.url));
  return (
    <section className={`flex flex-col gap-4 rounded-2xl border-2 p-5 sm:p-6 ${style.className}`}>
      <h2 className="text-3xl font-bold sm:text-4xl">
        {style.icon} {labels.verdict[result.verdict]}
      </h2>
      <p className="text-xl font-semibold leading-snug sm:text-2xl">
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
      {result.articles.map((a) => (
        <p key={a.url} className="text-base">
          <span aria-hidden>📰 </span>
          {labels.articleWeRead}{" "}
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-semibold break-words underline underline-offset-4">
            {a.title}
          </a>{" "}
          <span className="opacity-70">({a.domain})</span>
        </p>
      ))}
      {result.unreadableLinks.length > 0 && (
        <p className="text-base">
          <span aria-hidden>⚠️ </span>
          {labels.couldNotOpen} <span className="font-semibold">{result.unreadableLinks.join(", ")}</span>
        </p>
      )}
      {result.image?.text && (
        <details className="rounded-xl border border-current/30 p-4">
          <summary className="min-h-11 cursor-pointer text-base font-semibold">🖼️ {labels.imageText}</summary>
          <p className="mt-3 whitespace-pre-line text-base opacity-90">{result.image.text}</p>
        </details>
      )}
      <details className="group rounded-xl border border-current/30 bg-white/50 dark:bg-black/20">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
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
      <ul className="flex list-disc flex-col gap-3 pl-5 text-lg leading-relaxed">
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
