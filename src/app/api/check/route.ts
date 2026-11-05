import { z } from "zod";
import { checkMessage } from "@/lib/cached-fact-check";

export const maxDuration = 60;

const bodySchema = z.object(
  {
    text: z.string().trim().min(10, "Please paste a longer message.").max(5000, "Message is too long."),
  },
  { error: "Please paste a message to check." },
);

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  try {
    const started = Date.now();
    const result = await checkMessage(parsed.data.text);
    if (Date.parse(result.checkedAt) < started) console.info(`[cache] hit, checked at ${result.checkedAt}`);
    return Response.json(result);
  } catch (err) {
    console.error("fact-check failed", err);
    return Response.json({ error: "Something went wrong while checking. Please try again." }, { status: 500 });
  }
}
