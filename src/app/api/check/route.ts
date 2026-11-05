import { z } from "zod";
import { factCheck } from "@/lib/fact-check";

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
    return Response.json(await factCheck(parsed.data.text));
  } catch (err) {
    console.error("fact-check failed", err);
    return Response.json({ error: "Something went wrong while checking. Please try again." }, { status: 500 });
  }
}
