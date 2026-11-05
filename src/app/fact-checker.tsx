"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { detectLanguage, getUiText, UI_LANGUAGES, type ErrorCode, type UiLanguage } from "@/lib/ui-text";
import { ResultCard, type CheckResponse } from "./result-card";

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

// The chosen language is remembered on this phone. Storage can be unavailable (private mode),
// so every access is guarded and the page still works without it.
const LANGUAGE_KEY = "verifier.language";
const LANGUAGE_EVENT = "verifier-language";

function readLanguage(): UiLanguage {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved === "hi" || saved === "mr" || saved === "en") return saved;
  } catch {}
  return detectLanguage(navigator.languages);
}

function saveLanguage(language: UiLanguage) {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {}
  window.dispatchEvent(new Event(LANGUAGE_EVENT));
}

function subscribeToLanguage(onChange: () => void) {
  window.addEventListener(LANGUAGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(LANGUAGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

type Phase = "input" | "checking" | "result";
type Submitted = { text: string; imageUrl: string | null };
type CheckError = { code?: ErrorCode; message: string };

export function FactChecker() {
  const language = useSyncExternalStore(subscribeToLanguage, readLanguage, () => "en" as const);
  const ui = getUiText(language);

  const [phase, setPhase] = useState<Phase>("input");
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [error, setError] = useState<CheckError | null>(null);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Free the preview's memory when the image is replaced or removed.
  useEffect(() => {
    if (!image) return;
    return () => URL.revokeObjectURL(image.previewUrl);
  }, [image]);

  // Each view starts at the top, so the verdict is the first thing seen on a phone.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [phase]);

  async function addImage(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    setError(null);
    try {
      const blob = await shrinkImage(file);
      setImage({ blob, previewUrl: URL.createObjectURL(blob) });
    } catch {
      setError({ code: "image_unreadable", message: "We couldn't open this image." });
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
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setSubmitted({ text: text.trim(), imageUrl: image?.previewUrl ?? null });
    setPhase("checking");
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
      const res = await fetch("/api/check", { method: "POST", headers, body, signal: controller.signal });
      const data = await res.json();
      if (!res.ok) {
        setError({ code: data.code, message: data.error ?? "Something went wrong." });
        setPhase("input");
        return;
      }
      setResult(data);
      setPhase("result");
    } catch (err) {
      if (controller.signal.aborted) return; // cancelled: already back on the input view
      setError({ code: "server_error", message: err instanceof Error ? err.message : "Something went wrong." });
      setPhase("input");
    }
  }

  function cancel() {
    request.current?.abort();
    setPhase("input");
  }

  function checkAnother() {
    setText("");
    setImage(null);
    setResult(null);
    setSubmitted(null);
    setError(null);
    setPhase("input");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:gap-8 sm:py-12">
      <header className="flex flex-col gap-4">
        <LanguagePicker language={language} />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{ui.title}</h1>
          {phase === "input" && <p className="text-lg text-zinc-600 dark:text-zinc-400">{ui.subtitle}</p>}
        </div>
      </header>

      {phase === "input" && (
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
          {error && (
            <p role="alert" className="rounded-xl border-2 border-red-600 p-4 text-lg text-red-700 dark:text-red-300">
              {(error.code && ui.errors[error.code]) || error.message}
            </p>
          )}
          <label htmlFor="message" className="text-lg font-medium">
            {ui.inputLabel}
          </label>
          <textarea
            id="message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={image ? ui.placeholderWithImage : ui.placeholder}
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
            <div className="flex flex-col gap-3 rounded-xl border border-zinc-300 p-3 sm:flex-row sm:items-start dark:border-zinc-700">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview of an unsaved file */}
              <img src={image.previewUrl} alt={ui.imageAlt} className="max-h-48 self-start rounded-lg" />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="min-h-12 cursor-pointer rounded-lg border border-zinc-400 px-4 text-base sm:ml-auto"
              >
                {ui.removeImage}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="min-h-14 cursor-pointer rounded-xl border-2 border-dashed border-zinc-400 px-4 text-lg font-medium"
            >
              {ui.addImage}
            </button>
          )}

          <button
            type="submit"
            disabled={!image && text.trim().length < 10}
            className="min-h-14 cursor-pointer rounded-xl bg-foreground px-4 text-lg font-semibold text-background disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ui.check}
          </button>
        </form>
      )}

      {phase === "checking" && submitted && (
        <CheckingView submitted={submitted} hasImage={Boolean(submitted.imageUrl)} language={language} onCancel={cancel} />
      )}

      {phase === "result" && result && submitted && (
        <div className="flex flex-col gap-6">
          <ResultCard result={result} />
          <SubmittedPreview submitted={submitted} label={ui.youChecked} imageAlt={ui.imageAlt} />
          <button
            type="button"
            onClick={checkAnother}
            className="min-h-14 cursor-pointer rounded-xl bg-foreground px-4 text-lg font-semibold text-background"
          >
            {ui.checkAnother}
          </button>
        </div>
      )}
    </main>
  );
}

function LanguagePicker({ language }: { language: UiLanguage }) {
  return (
    <div role="group" aria-label="Language / भाषा" className="flex gap-2 self-end">
      {UI_LANGUAGES.map(({ code, name }) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={code === language}
          onClick={() => saveLanguage(code)}
          className="min-h-11 cursor-pointer rounded-full border border-zinc-400 px-4 text-base aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
        >
          {name}
        </button>
      ))}
    </div>
  );
}

// Rough timings from our measurements. The server doesn't report progress yet, so this shows the
// usual order of work rather than exactly where this check is.
const STEP_SECONDS = { withImage: [7, 14, 17], textOnly: [7, 10] };

function CheckingView({
  submitted,
  hasImage,
  language,
  onCancel,
}: {
  submitted: Submitted;
  hasImage: boolean;
  language: UiLanguage;
  onCancel: () => void;
}) {
  const ui = getUiText(language);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 500);
    return () => clearInterval(timer);
  }, []);

  const steps = hasImage
    ? [ui.steps.readImage, ui.steps.findClaims, ui.steps.search, ui.steps.judge]
    : [ui.steps.findClaims, ui.steps.search, ui.steps.judge];
  const boundaries = hasImage ? STEP_SECONDS.withImage : STEP_SECONDS.textOnly;
  const current = boundaries.filter((t) => elapsed >= t).length;

  return (
    <section aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-zinc-300 p-6 text-center dark:border-zinc-700">
        <div
          aria-hidden
          className="size-14 animate-spin rounded-full border-4 border-zinc-300 border-t-foreground dark:border-zinc-700 dark:border-t-foreground"
        />
        <p className="text-2xl font-semibold">{ui.checking}</p>
        <ol className="flex w-full max-w-sm flex-col gap-3 text-left text-lg">
          {steps.map((step, i) => (
            <li key={step} className={`flex items-center gap-3 ${i > current ? "opacity-40" : ""}`}>
              <span aria-hidden className={`w-6 text-center ${i === current ? "animate-pulse" : ""}`}>
                {i < current ? "✓" : i === current ? "●" : "○"}
              </span>
              <span className={i === current ? "font-semibold" : ""}>{step}</span>
            </li>
          ))}
        </ol>
        <p className="text-base text-zinc-600 dark:text-zinc-400">{ui.usuallyTakes}</p>
      </div>
      <SubmittedPreview submitted={submitted} label={ui.youChecked} imageAlt={ui.imageAlt} />
      <button
        type="button"
        onClick={onCancel}
        className="min-h-12 cursor-pointer self-center rounded-xl border border-zinc-400 px-6 text-base"
      >
        {ui.cancel}
      </button>
    </section>
  );
}

// A compact, read-only copy of what was sent, so it's clear which message the verdict is about.
function SubmittedPreview({ submitted, label, imageAlt }: { submitted: Submitted; label: string; imageAlt: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-zinc-100 p-4 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{label}</h2>
      {submitted.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- local preview of an unsaved file
        <img src={submitted.imageUrl} alt={imageAlt} className="max-h-40 self-start rounded-lg" />
      )}
      {submitted.text && <p className="line-clamp-4 text-base break-words whitespace-pre-line">{submitted.text}</p>}
    </section>
  );
}
