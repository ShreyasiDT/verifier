// Sanity check that the LLM proxy and Exa keys in .env.local work.
// Run: pnpm check:providers
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import Exa from "exa-js";

const chatgpt = createOpenAICompatible({
  name: "chatgpt",
  baseURL: process.env.CHATGPT_PROXY_BASE_URL,
  apiKey: process.env.CHATGPT_PROXY_API_KEY,
  includeUsage: true,
  supportsStructuredOutputs: true,
});

async function check(name, fn) {
  try {
    console.log(`✅ ${name}: ${await fn()}`);
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

await check("LLM", async () => {
  const { text } = await generateText({
    model: chatgpt(process.env.LLM_MODEL),
    prompt: "Reply with the single word: pong",
  });
  return text.trim();
});

await check("Exa", async () => {
  const exa = new Exa(process.env.EXA_API_KEY);
  const { results } = await exa.search("WHO official website", { numResults: 1 });
  return results[0]?.url ?? "no results";
});
