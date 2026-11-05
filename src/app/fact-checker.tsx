"use client";

import { useEffect, useRef, useState } from "react";
import type { ClaimCheck, FactCheckResult, UnverifiableReason, Verdict } from "@/lib/fact-check";
import { getLabels } from "@/lib/labels";
import type { ImageReading } from "@/lib/read-image";

type CheckResponse = FactCheckResult & { image: ImageReading | null };

// Phone photos can be several MB; this is plenty to read text and keeps uploads small.
const MAX_IMAGE_SIDE = 1600;

async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read this image."))), "image/jpeg", 0.85),
  );
}

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
  const [image, setImage] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Free the preview's memory when the image is replaced or removed.
  useEffect(() => {
    if (!image) return;
    return () => URL.revokeObjectURL(image.previewUrl);
  }, [image]);

  async function addImage(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    setError(null);
    try {
      const blob = await shrinkImage(file);
      setImage({ blob, previewUrl: URL.createObjectURL(blob) });
    } catch {
      setError("We couldn't open this image. Please try a JPG or PNG screenshot.");
    }
  }

  // Screenshots are often pasted straight from the clipboard.
  function handlePaste(e: React.ClipboardEvent) {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      addImage(file);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let body: BodyInit;
      const headers: HeadersInit = {};
      if (image) {
        const form = new FormData();
        form.set("text", text);
        form.set("image", image.blob, "image.jpg");
        body = form;
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({ text });
      }
      const res = await fetch("/api/check", { method: "POST", headers, body });
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
      <form
        onSubmit={handleSubmit}
        onPaste={handlePaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addImage(e.dataTransfer.files[0]);
        }}
        className="flex flex-col gap-4"
      >
        <label htmlFor="message" className="text-lg font-medium">
          Paste the message or link you received
        </label>
        <textarea
          id="message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder={
            image
              ? "Optional: add the message that came with the image…"
              : "e.g. Government is giving ₹5000 to every citizen, apply before Friday…"
          }
          className="w-full rounded-xl border border-zinc-300 bg-white p-4 text-lg dark:border-zinc-700 dark:bg-zinc-900"
        />

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            addImage(e.target.files?.[0]);
            e.target.value = ""; // so choosing the same file again still triggers a change
          }}
        />
        {image ? (
          <div className="flex items-start gap-4 rounded-xl border border-zinc-300 p-3 dark:border-zinc-700">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview of an unsaved file */}
            <img src={image.previewUrl} alt="The image you added" className="max-h-40 rounded-lg" />
            <button
              type="button"
              onClick={() => setImage(null)}
              className="ml-auto rounded-lg border border-zinc-400 px-3 py-2 text-base"
            >
              ✕ Remove image
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="h-14 rounded-xl border-2 border-dashed border-zinc-400 text-lg font-medium"
          >
            📷 Add a photo or screenshot
          </button>
        )}

        <button
          type="submit"
          disabled={loading || (!image && text.trim().length < 10)}
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

function ResultCard({ result }: { result: CheckResponse }) {
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
      {result.articles.map((a) => (
        <p key={a.url} className="text-base">
          <span aria-hidden>📰 </span>
          {labels.articleWeRead}{" "}
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">
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
          <summary className="cursor-pointer text-base font-semibold">🖼️ {labels.imageText}</summary>
          <p className="mt-3 whitespace-pre-line text-base opacity-90">{result.image.text}</p>
        </details>
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
