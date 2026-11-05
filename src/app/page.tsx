import { FactChecker } from "./fact-checker";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight">Is this true?</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Got a forward on WhatsApp? Paste it below and we&apos;ll check it against trusted sources on the web.
        </p>
      </header>
      <FactChecker />
    </main>
  );
}
