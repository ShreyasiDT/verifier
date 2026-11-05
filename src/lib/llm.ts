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
