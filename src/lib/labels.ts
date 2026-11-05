import type { Verdict } from "./fact-check";

// Fixed UI text for the result card, in the languages our users write in.
// Anything else falls back to English.
type CardLabels = {
  verdict: Record<Verdict, string>;
  why: Record<Verdict, string>;
  whatWeChecked: string;
  sources: string;
};

const LABELS: Record<string, CardLabels> = {
  en: {
    verdict: { true: "True", false: "False", misleading: "Misleading", unverifiable: "Can't verify" },
    why: {
      true: "Understand why it's right!",
      false: "Understand why it's wrong!",
      misleading: "Understand why it's misleading!",
      unverifiable: "Understand why we can't verify it",
    },
    whatWeChecked: "What we checked:",
    sources: "Sources",
  },
  hi: {
    verdict: { true: "सच", false: "झूठ", misleading: "भ्रामक", unverifiable: "पुष्टि नहीं हो सकी" },
    why: {
      true: "समझिए यह सच क्यों है!",
      false: "समझिए यह झूठ क्यों है!",
      misleading: "समझिए यह भ्रामक क्यों है!",
      unverifiable: "समझिए इसकी पुष्टि क्यों नहीं हो सकी",
    },
    whatWeChecked: "हमने क्या जाँचा:",
    sources: "स्रोत",
  },
  mr: {
    verdict: { true: "खरे", false: "खोटे", misleading: "दिशाभूल करणारे", unverifiable: "खात्री करता आली नाही" },
    why: {
      true: "समजून घ्या हे खरे का आहे!",
      false: "समजून घ्या हे खोटे का आहे!",
      misleading: "समजून घ्या हे दिशाभूल करणारे का आहे!",
      unverifiable: "समजून घ्या याची खात्री का करता आली नाही",
    },
    whatWeChecked: "आम्ही काय तपासले:",
    sources: "स्रोत",
  },
};

export function getLabels(languageCode: string): CardLabels {
  return LABELS[languageCode] ?? LABELS.en;
}
