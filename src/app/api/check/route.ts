import { z } from "zod";
import { checkMessage } from "@/lib/cached-fact-check";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { messageWithImage, readImage, type ImageReading } from "@/lib/read-image";
import type { ErrorCode } from "@/lib/ui-text";

export const maxDuration = 60;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
// Vercel rejects request bodies over 4.5 MB. The page shrinks photos first, so real uploads are far smaller.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const textSchema = z.object(
  {
    text: z.string().trim().min(10, "Please paste a longer message.").max(5000, "Message is too long."),
  },
  { error: "Please paste a message to check." },
);

// With an image, the text is optional: it's whatever the user typed alongside it.
const imageTextSchema = z.string().trim().max(5000, "Message is too long.");

// Errors carry a code so the page can show them in the person's language; the English text is a fallback.
function errorResponse(code: ErrorCode, error: string, status: number) {
  return Response.json({ error, code }, { status });
}

// Zod issues for the message text, as error codes.
function textErrorCode(issue: z.core.$ZodIssue | undefined): ErrorCode {
  if (issue?.code === "too_small") return "too_short";
  if (issue?.code === "too_big") return "too_long";
  return "no_message";
}

export async function POST(request: Request) {
  const input = await parseInput(request);
  if ("error" in input) return errorResponse(input.code, input.error, 400);

  const limit = await checkRateLimit(clientIp(request));
  if (!limit.ok) {
    const response =
      limit.scope === "person"
        ? errorResponse("rate_limited", "You've checked a lot of messages. Please try again in a little while.", 429)
        : errorResponse("daily_limit", "We've reached today's limit for checks. Please try again tomorrow.", 429);
    response.headers.set("Retry-After", String(limit.retryAfterSeconds));
    return response;
  }

  try {
    let message = input.text;
    let reading: ImageReading | null = null;
    if (input.image) {
      reading = await readImage(input.image.bytes, input.image.type);
      if (!reading.text.trim() && input.text.length < 10) {
        return errorResponse(
          "no_text_in_image",
          "We couldn't find any text in this image. Please type the message that came with it.",
          422,
        );
      }
      message = messageWithImage(input.text, reading);
    }

    const started = Date.now();
    const result = await checkMessage(message);
    if (Date.parse(result.checkedAt) < started) console.info(`[cache] hit, checked at ${result.checkedAt}`);
    return Response.json({ ...result, image: reading });
  } catch (err) {
    // Checked by name: the error may be recreated when crossing the cache boundary.
    if (err instanceof Error && err.name === "UnreadableLinkError") {
      return errorResponse(
        "unreadable_link",
        "We couldn't open this link. Please paste the text of the message or article instead.",
        422,
      );
    }
    console.error("fact-check failed", err);
    return errorResponse("server_error", "Something went wrong while checking. Please try again.", 500);
  }
}

type Input = { text: string; image?: { bytes: Uint8Array; type: string } } | { error: string; code: ErrorCode };

// The page sends JSON for text only, and a form upload when there's an image.
async function parseInput(request: Request): Promise<Input> {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const parsed = textSchema.safeParse(await request.json().catch(() => null));
    if (parsed.success) return { text: parsed.data.text };
    const issue = parsed.error.issues[0];
    return { error: issue?.message ?? "Invalid request.", code: textErrorCode(issue) };
  }

  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof File) || image.size === 0) return { error: "Please choose an image to check.", code: "no_image" };
  if (!IMAGE_TYPES.includes(image.type)) {
    return { error: "Please upload a JPG, PNG or WebP image.", code: "bad_image_type" };
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return { error: "This image is too large. Please choose one under 4 MB.", code: "image_too_large" };
  }

  const text = imageTextSchema.safeParse(form?.get("text") ?? "");
  if (!text.success) {
    const issue = text.error.issues[0];
    return { error: issue?.message ?? "Invalid request.", code: textErrorCode(issue) };
  }
  return { text: text.data, image: { bytes: new Uint8Array(await image.arrayBuffer()), type: image.type } };
}
