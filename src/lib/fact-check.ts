import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { model } from "./llm";
import { searchWeb, type SearchResult } from "./search";

export const VERDICTS = ["true", "false", "misleading", "unverifiable"] as const;
export type Verdict = (typeof VERDICTS)[number];

// Why a claim couldn't be verified. Only set when verdict is "unverifiable".
export const UNVERIFIABLE_REASONS = [
  "local_news", // small local or personal event the internet doesn't cover
  "too_recent", // happened so recently that coverage may not exist yet
  "no_evidence", // a big claim that would be widely reported if true, but nothing was found
  "conflicting_sources", // trustworthy sources disagree
  "not_a_fact", // opinion, prediction, blessing or emotional appeal: nothing to check
] as const;
export type UnverifiableReason = (typeof UNVERIFIABLE_REASONS)[number];

export type FactCheckResult = {
  languageCode: string;
  claim: string;
  verdict: Verdict;
  unverifiableReason: UnverifiableReason | null;
  headline: string;
  reasons: string[];
  sources: { title: string; url: string }[];
};

const claimSchema = z.object({
  language: z.string().describe("Language the message is written in, e.g. Marathi, Hindi, English"),
  languageCode: z.string().describe("ISO 639-1 code of that language, e.g. mr, hi, en"),
  claim: z.string().describe("The core factual claim as one neutral sentence, in the message's language"),
  searchQueries: z
    .array(z.string())
    .min(1)
    .max(2)
    .describe("Short web search queries: one in English, plus one in the message's language if it isn't English"),
  scope: z
    .enum(["local", "public"])
    .describe(
      "'local' if it's about a small community or a few people (school or village event, local felicitation, " +
        "obituary, local shop); 'public' if it affects or interests many people (government schemes, health, " +
        "money, national or world news, celebrities, disasters)",
    ),
});

const verdictSchema = z.object({
  verdict: z.enum(VERDICTS),
  unverifiableReason: z
    .enum(UNVERIFIABLE_REASONS)
    .nullable()
    .describe("Why the claim can't be verified; null unless verdict is 'unverifiable'"),
  headline: z
    .string()
    .describe("The answer in one short, everyday sentence of at most 10 words, e.g. 'No, the government is not giving ₹5000'"),
  reasons: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe("2-4 very short, simple points explaining why, one idea per point"),
  citations: z
    .array(
      z.object({
        id: z.number().int(),
        title: z.string().describe("The source's title translated into the message's language; keep names as they are"),
      }),
    )
    .describe("Sources that directly address this specific claim; empty if none do"),
});

export async function factCheck(message: string): Promise<FactCheckResult> {
  // 1. Turn the raw forward into a checkable claim and a search query.
  const { output: extracted } = await generateText({
    model,
    output: Output.object({ schema: claimSchema }),
    system:
      "You extract the main factual claim from messages people receive, such as WhatsApp forwards. " +
      "Ignore greetings, emojis and calls to action like 'forward this to 10 people'.",
    prompt: message,
  });

  // 2. Search the web for evidence, merging results from each query.
  const resultSets = await Promise.all(extracted.searchQueries.map((q) => searchWeb(q)));
  const sources = [...new Map(resultSets.flat().map((s) => [s.url.toLowerCase(), s])).values()].slice(0, 8);

  // 3. Judge the claim using only the retrieved sources.
  const { output: judged } = await generateText({
    model,
    output: Output.object({ schema: verdictSchema }),
    system:
      "You are a careful fact-checker. Judge the claim using ONLY the numbered sources provided. " +
      "Prefer established news outlets, official bodies and fact-checking sites. " +
      "Use 'misleading' when the claim is partly true or missing important context, and " +
      "'unverifiable' when the sources don't settle it. Never invent sources.\n\n" +
      `Write the headline and reasons in ${extracted.language}.\n\n` +
      "Your readers are elderly parents with no background in science, maths or technology. " +
      "Write like you are gently explaining to your grandmother:\n" +
      "- Use everyday words. Avoid technical terms; if one is unavoidable, explain it in a few words.\n" +
      "- No percentages, statistics, units or study names unless truly needed.\n" +
      "- Use a familiar comparison when it helps, e.g. 'about as much as a short flight'.\n" +
      "- Keep each point to one or two short sentences.\n" +
      "- Mention who confirmed it in plain terms, e.g. 'RBI, India's central bank, says…'. " +
      "The reader never sees the numbered list, so never say 'the given', 'provided' or 'these' sources/news; say 'news reports' or 'trusted websites'.\n" +
      "- Don't put source numbers like [1] in the text; sources are shown separately.\n\n" +
      "Only cite sources that are about this specific claim. Don't cite sources that are merely " +
      "on a related topic just to show what you searched.\n\n" +
      "For 'unverifiable', pick the reason that fits best:\n" +
      "- local_news: a small local or personal event (school function, local felicitation, " +
      "obituary, village news). The internet simply doesn't cover it; this is usually harmless.\n" +
      "- too_recent: it happened in the last day or two, so reports may not exist yet.\n" +
      "- no_evidence: a big claim (government scheme, health cure, disaster, celebrity, money) " +
      "that would be widely reported if true, yet no trustworthy source mentions it. Be cautious.\n" +
      "- conflicting_sources: trustworthy sources disagree with each other.\n" +
      "- not_a_fact: opinion, prediction, blessing or emotional appeal with nothing to check.\n" +
      "The headline must state the reason, e.g. 'Local event — not reported online'. " +
      "The reasons must: (1) say clearly why it can't be verified, (2) say that this does NOT " +
      "mean it is false, unless the reason is no_evidence, where it should say the lack of reports " +
      "is itself a warning sign, and (3) suggest one practical way the reader could confirm it, " +
      "e.g. asking the organiser, checking the local newspaper or an official website.",
    prompt:
      `Today's date: ${new Date().toDateString()}\n` +
      `Scope: ${extracted.scope} (if unverifiable and scope is local, the reason is local_news, never no_evidence)\n\n` +
      `Original message:\n${message}\n\nClaim: ${extracted.claim}\n\n` +
      `Sources:\n${sources.length > 0 ? formatSources(sources) : "(no sources found)"}`,
  });

  // Map ids back to real URLs so links can only come from the search results.
  const cited = new Map<string, { title: string; url: string }>();
  for (const { id, title } of judged.citations) {
    const source = sources[id - 1];
    if (source) cited.set(source.url, { title: title.trim() || source.title, url: source.url });
  }

  return {
    languageCode: extracted.languageCode.toLowerCase(),
    claim: extracted.claim,
    verdict: judged.verdict,
    unverifiableReason: unverifiableReason(judged, extracted.scope),
    headline: judged.headline,
    // Safety net in case the model still writes citation markers into the text.
    reasons: judged.reasons.map((r) => r.replace(/\s*\[\d+\]/g, "")),
    sources: [...cited.values()],
  };
}

// Missing coverage of local news is expected, not a warning sign, so never flag it as no_evidence.
function unverifiableReason(
  judged: { verdict: Verdict; unverifiableReason: UnverifiableReason | null },
  scope: "local" | "public",
): UnverifiableReason | null {
  if (judged.verdict !== "unverifiable") return null;
  if (scope === "local" && judged.unverifiableReason === "no_evidence") return "local_news";
  return judged.unverifiableReason;
}

function formatSources(sources: SearchResult[]) {
  return sources
    .map(
      (s, i) =>
        `[${i + 1}] ${s.title}\nURL: ${s.url}\n` +
        (s.publishedDate ? `Published: ${s.publishedDate}\n` : "") +
        `${s.text}`,
    )
    .join("\n\n---\n\n");
}
