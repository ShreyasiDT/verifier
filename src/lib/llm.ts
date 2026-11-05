import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const chatgpt = createOpenAICompatible({
  name: "chatgpt",
  baseURL: process.env.CHATGPT_PROXY_BASE_URL!,
  apiKey: process.env.CHATGPT_PROXY_API_KEY,
  includeUsage: true,
  supportsStructuredOutputs: true,
});

export const model = chatgpt(process.env.LLM_MODEL ?? "gpt-6-luna");

// Mechanical steps (copying text, listing claims, a one-line summary) don't need deep reasoning,
// and low effort makes them several seconds faster. Judging keeps the model's default.
export const lowEffort = { chatgpt: { reasoningEffort: "low" } };
