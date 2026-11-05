import "server-only";
import { createHash } from "node:crypto";
import { generateText, Output } from "ai";
import { z } from "zod";
import { lowEffort, model } from "./llm";

export type ImageReading = {
  text: string; // every piece of text in the image, in its original language
  description: string; // what the image shows, e.g. "a screenshot of a WhatsApp message"
};

const readingSchema = z.object({
  text: z
    .string()
    .describe(
      "All text in the image exactly as written, in its original language and script, including any links. " +
        "Leave out phone UI such as the clock, battery, app buttons and 'Forwarded' labels. Empty if there is none.",
    ),
  description: z
    .string()
    .describe(
      "One or two plain sentences in English on what the image shows, e.g. 'A screenshot of a WhatsApp " +
        "message', 'A newspaper clipping', 'A photo of a flooded street'. Describe, don't judge whether it's real.",
    ),
});

// WhatsApp forwards of the same image are often byte-identical, so remember what we read to skip the
// vision call. Kept in server memory like the result cache, and bounded so it can't grow forever.
const readings = new Map<string, { reading: ImageReading; expires: number }>();
const MAX_ENTRIES = 500;
const LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export async function readImage(image: Uint8Array, mediaType: string): Promise<ImageReading> {
  const key = createHash("sha256").update(image).digest("hex");
  const saved = readings.get(key);
  if (saved && saved.expires > Date.now()) return saved.reading;

  const started = performance.now();
  const { output } = await generateText({
    model,
    providerOptions: lowEffort,
    output: Output.object({ schema: readingSchema }),
    system:
      "You read images that people received as WhatsApp forwards so their claims can be fact-checked. " +
      "Copy the text faithfully; don't translate, summarise or correct it.",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Read this image." },
          { type: "file", mediaType, data: image },
        ],
      },
    ],
  });
  console.info(`[timing] read image ${((performance.now() - started) / 1000).toFixed(1)}s`);

  if (readings.size >= MAX_ENTRIES) readings.delete(readings.keys().next().value!);
  readings.set(key, { reading: output, expires: Date.now() + LIFETIME_MS });
  return output;
}

// What the rest of the pipeline checks: the user's own words plus what the image says, marked so the
// model knows which is which.
export function messageWithImage(text: string, reading: ImageReading) {
  return [
    text.trim(),
    `[Image: ${reading.description}]`,
    reading.text.trim() ? `[Text in the image]\n${reading.text.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
