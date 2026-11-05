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

type Source = { title: string; url: string };

export type ClaimCheck = {
  claim: string;
  verdict: Verdict;
  unverifiableReason: UnverifiableReason | null;
  headline: string;
  reasons: string[];
  sources: Source[];
};

export type FactCheckResult = {
  languageCode: string;
  // Overall verdict for the whole message, combined from its claims.
  verdict: Verdict;
  unverifiableReason: UnverifiableReason | null;
  headline: string;
  claims: ClaimCheck[];
  sources: Source[];
};

type Scope = "local" | "public";
type Language = { language: string; languageCode: string };

const extractionSchema = z.object({
  language: z.string().describe("Language the message is written in, e.g. Marathi, Hindi, English"),
  languageCode: z.string().describe("ISO 639-1 code of that language, e.g. mr, hi, en"),
  claims: z
    .array(
      z.object({
        claim: z.string().describe("One factual claim as a neutral sentence, in the message's language"),
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
      }),
    )
    .min(1)
    .max(3),
});

// Field order matters: the model writes fields in this order, so it works out the reasons
// before committing to a verdict, and writes the headline last so it matches the verdict.
const verdictSchema = z.object({
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
  verdict: z
    .enum(VERDICTS)
    .describe(
      "Whether the claim as the message states it is correct, based on your reasons. " +
        "If any part of it is wrong, it is not 'true'. Use 'false' only when trustworthy sources say " +
        "the opposite or have debunked it; if they simply don't mention it, use 'unverifiable'.",
    ),
  unverifiableReason: z
    .enum(UNVERIFIABLE_REASONS)
    .nullable()
    .describe("Why the claim can't be verified; null unless verdict is 'unverifiable'"),
  headline: z
    .string()
    .describe(
      "The answer in one short, everyday sentence of at most 10 words that agrees with the verdict, " +
        "e.g. 'No, the government is not giving ₹5000'",
    ),
});

export async function factCheck(message: string): Promise<FactCheckResult> {
  // 1. Split the raw forward into separate checkable claims.
  const { output: extracted } = await generateText({
    model,
    output: Output.object({ schema: extractionSchema }),
    system:
      "You extract the factual claims from messages people receive, such as WhatsApp forwards. " +
      "Split the message into statements that could each be true or false on their own, even when they " +
      "are about the same person or topic: 'Lata Mangeshkar got the Bharat Ratna in 2001' and 'she was the " +
      "first singer to get it' are two claims. But keep the details of one single event together as ONE " +
      "claim: a report of a ceremony with its place, date and the people honoured is one claim. " +
      "Most messages make just one claim. Keep the most important ones (at most 3). " +
      "Ignore greetings, emojis and requests to forward the message. But never drop advice or warnings " +
      "such as 'don't give children bananas', 'stop your medicine' or 'don't go to the station': they are " +
      "usually the harmful part, so check them as a claim together with the reason the message gives.",
    prompt: message,
  });

  // 2. Check every claim at the same time.
  const claims = await Promise.all(extracted.claims.map((c) => checkClaim(message, c, extracted)));

  const verdict = overallVerdict(claims);
  const sources = new Map(claims.flatMap((c) => c.sources).map((s) => [s.url, s]));

  return {
    languageCode: extracted.languageCode.toLowerCase(),
    verdict,
    unverifiableReason: verdict === "unverifiable" ? overallReason(claims) : null,
    headline: claims.length === 1 ? claims[0].headline : await summarise(claims, verdict, extracted.language),
    claims,
    sources: [...sources.values()],
  };
}

async function checkClaim(
  message: string,
  { claim, searchQueries, scope }: { claim: string; searchQueries: string[]; scope: Scope },
  { language }: Language,
): Promise<ClaimCheck> {
  // Search the web for evidence, merging results from each query. The model occasionally returns
  // an empty query, so fall back to the claim itself.
  const queries = searchQueries.map((q) => q.trim()).filter(Boolean);
  const resultSets = await Promise.all((queries.length > 0 ? queries : [claim]).map((q) => searchWeb(q)));
  const sources = [...new Map(resultSets.flat().map((s) => [s.url.toLowerCase(), s])).values()].slice(0, 8);

  // Judge the claim using only the retrieved sources.
  const { output: judged } = await generateText({
    model,
    output: Output.object({ schema: verdictSchema }),
    system:
      "You are a careful fact-checker. Judge the claim using ONLY the numbered sources provided. " +
      "Prefer established news outlets, official bodies and fact-checking sites. " +
      "Use 'misleading' when the claim is partly true or missing important context, and " +
      "'unverifiable' when the sources don't settle it. Never invent sources.\n\n" +
      "'False' needs positive evidence: a source that contradicts the claim or a fact-check that " +
      "debunks it. 'No report mentions it' is never enough for 'false', however unlikely the claim " +
      "sounds; that is 'unverifiable' (usually no_evidence or too_recent). A similar but different " +
      "older event in the sources doesn't prove today's claim false either. But experts or official " +
      "bodies saying something is safe, harmless, doesn't work or isn't how things work DOES contradict " +
      "a claim that it is dangerous or works, so that is 'false'.\n\n" +
      `Write the headline and reasons in ${language}.\n\n` +
      "Your readers are elderly parents with no background in science, maths or technology. " +
      "Write like you are gently explaining to your grandmother:\n" +
      "- Use everyday words. Avoid technical terms; if one is unavoidable, explain it in a few words.\n" +
      "- No percentages, statistics, units or study names unless truly needed.\n" +
      "- Use a familiar comparison when it helps, e.g. 'about as much as a short flight'.\n" +
      "- Keep each point to one or two short sentences.\n" +
      "- Mention who confirmed it in plain terms, e.g. 'RBI, India's central bank, says…'. " +
      "The reader never sees the numbered list, so never say 'the given', 'provided' or 'these' sources/news; say 'news reports' or 'trusted websites'.\n" +
      "- Don't put source numbers like [1] in the text; sources are shown separately.\n" +
      "- The headline must be accurate on its own. If the claim says someone (e.g. UNESCO, NASA, RBI) " +
      "announced something, check both who said it and what was said, and don't attribute things to them " +
      "that the sources don't.\n\n" +
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
      `Scope: ${scope} (if unverifiable and scope is local, the reason is local_news, never no_evidence)\n\n` +
      `Original message:\n${message}\n\nClaim to check: ${claim}\n\n` +
      `Sources:\n${sources.length > 0 ? formatSources(sources) : "(no sources found)"}`,
  });

  // Map ids back to real URLs so links can only come from the search results.
  const cited = new Map<string, Source>();
  for (const { id, title } of judged.citations) {
    const source = sources[id - 1];
    if (source) cited.set(source.url, { title: title.trim() || source.title, url: source.url });
  }

  return {
    claim,
    verdict: judged.verdict,
    unverifiableReason: unverifiableReason(judged, scope),
    headline: judged.headline,
    // Safety net in case the model still writes citation markers into the text.
    reasons: judged.reasons.map((r) => r.replace(/\s*\[\d+\]/g, "")),
    sources: [...cited.values()],
  };
}

// One false claim makes the whole forward unsafe to share, so the worst verdict wins.
// Confirmed claims mixed with unconfirmed ones can't be called true as a whole.
function overallVerdict(claims: ClaimCheck[]): Verdict {
  const verdicts = new Set(claims.map((c) => c.verdict));
  if (verdicts.has("false")) return "false";
  if (verdicts.has("misleading")) return "misleading";
  if (verdicts.has("unverifiable")) return "unverifiable";
  return "true";
}

// Most worrying reason first, so a suspicious claim isn't hidden behind a harmless one.
const REASON_PRIORITY: UnverifiableReason[] = [
  "no_evidence",
  "conflicting_sources",
  "too_recent",
  "local_news",
  "not_a_fact",
];

function overallReason(claims: ClaimCheck[]): UnverifiableReason | null {
  const reasons = new Set(claims.map((c) => c.unverifiableReason));
  return REASON_PRIORITY.find((r) => reasons.has(r)) ?? null;
}

async function summarise(claims: ClaimCheck[], verdict: Verdict, language: string) {
  const { output } = await generateText({
    model,
    output: Output.object({
      schema: z.object({
        headline: z.string().describe("One short, everyday sentence of at most 12 words"),
      }),
    }),
    system:
      `Sum up a fact-check of a forwarded message in ${language} for elderly readers. ` +
      `The overall verdict is '${verdict}'. Say in plain words which part is wrong or unconfirmed, ` +
      "e.g. 'Mostly true, but the Great Wall part is false'.",
    prompt: claims.map((c) => `- ${c.verdict}: ${c.claim} (${c.headline})`).join("\n"),
  });
  return output.headline;
}

// Missing coverage of local news is expected, not a warning sign, so never flag it as no_evidence.
function unverifiableReason(
  judged: { verdict: Verdict; unverifiableReason: UnverifiableReason | null },
  scope: Scope,
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
