// Text for the page itself (heading, buttons, progress, errors), in the language the person picks.
// The result card's own labels follow the checked message's language instead (see labels.ts).

export const UI_LANGUAGES = [
  { code: "hi", name: "हिंदी" },
  { code: "mr", name: "मराठी" },
  { code: "en", name: "English" },
] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number]["code"];

// Error codes the API returns alongside its English message.
export type ErrorCode =
  | "too_short"
  | "too_long"
  | "no_message"
  | "no_image"
  | "bad_image_type"
  | "image_too_large"
  | "image_unreadable"
  | "no_text_in_image"
  | "unreadable_link"
  | "server_error";

type UiText = {
  title: string;
  subtitle: string;
  inputLabel: string;
  placeholder: string;
  placeholderWithImage: string;
  addImage: string;
  removeImage: string;
  imageAlt: string;
  check: string;
  checking: string;
  usuallyTakes: string;
  cancel: string;
  steps: { readImage: string; findClaims: string; search: string; judge: string };
  youChecked: string;
  checkAnother: string;
  errors: Record<ErrorCode, string>;
};

const TEXT: Record<UiLanguage, UiText> = {
  en: {
    title: "Is this true?",
    subtitle: "Got a forward on WhatsApp? Paste it below and we'll check it against trusted sources.",
    inputLabel: "Paste the message or link you received",
    placeholder: "e.g. Government is giving ₹5000 to every citizen, apply before Friday…",
    placeholderWithImage: "Optional: add the message that came with the image…",
    addImage: "📷 Add a photo or screenshot",
    removeImage: "✕ Remove image",
    imageAlt: "The image you added",
    check: "Check this message",
    checking: "Checking your message…",
    usuallyTakes: "This usually takes 15–30 seconds.",
    cancel: "Cancel",
    steps: {
      readImage: "Reading the image",
      findClaims: "Finding what the message claims",
      search: "Searching fact-checkers and news",
      judge: "Checking each claim",
    },
    youChecked: "You checked",
    checkAnother: "🔁 Check another message",
    errors: {
      too_short: "Please paste a longer message.",
      too_long: "This message is too long. Please paste a shorter part of it.",
      no_message: "Please paste a message to check.",
      no_image: "Please choose an image to check.",
      bad_image_type: "Please choose a JPG, PNG or WebP image.",
      image_too_large: "This image is too large. Please choose one under 5 MB.",
      image_unreadable: "We couldn't open this image. Please try a JPG or PNG screenshot.",
      no_text_in_image: "We couldn't find any text in this image. Please type the message that came with it.",
      unreadable_link: "We couldn't open this link. Please paste the text of the message or article instead.",
      server_error: "Something went wrong while checking. Please try again.",
    },
  },
  hi: {
    title: "क्या यह सच है?",
    subtitle: "WhatsApp पर कोई मैसेज आया है? उसे नीचे डालें, हम भरोसेमंद स्रोतों से उसकी जाँच करेंगे।",
    inputLabel: "आपको मिला मैसेज या लिंक यहाँ डालें",
    placeholder: "जैसे: सरकार हर नागरिक को ₹5000 दे रही है, शुक्रवार से पहले आवेदन करें…",
    placeholderWithImage: "चाहें तो तस्वीर के साथ आया मैसेज भी लिखें…",
    addImage: "📷 फ़ोटो या स्क्रीनशॉट जोड़ें",
    removeImage: "✕ तस्वीर हटाएँ",
    imageAlt: "आपकी जोड़ी गई तस्वीर",
    check: "इस मैसेज की जाँच करें",
    checking: "आपके मैसेज की जाँच हो रही है…",
    usuallyTakes: "इसमें आमतौर पर 15–30 सेकंड लगते हैं।",
    cancel: "रद्द करें",
    steps: {
      readImage: "तस्वीर पढ़ी जा रही है",
      findClaims: "मैसेज के दावे पहचाने जा रहे हैं",
      search: "फ़ैक्ट-चेकर और खबरें खोजी जा रही हैं",
      judge: "हर दावे की जाँच हो रही है",
    },
    youChecked: "आपने यह जाँचा",
    checkAnother: "🔁 दूसरा मैसेज जाँचें",
    errors: {
      too_short: "कृपया थोड़ा लंबा मैसेज डालें।",
      too_long: "यह मैसेज बहुत लंबा है। कृपया इसका छोटा हिस्सा डालें।",
      no_message: "कृपया जाँचने के लिए कोई मैसेज डालें।",
      no_image: "कृपया जाँचने के लिए कोई तस्वीर चुनें।",
      bad_image_type: "कृपया JPG, PNG या WebP तस्वीर चुनें।",
      image_too_large: "यह तस्वीर बहुत बड़ी है। कृपया 5 MB से छोटी तस्वीर चुनें।",
      image_unreadable: "यह तस्वीर नहीं खुल सकी। कृपया JPG या PNG स्क्रीनशॉट आज़माएँ।",
      no_text_in_image: "इस तस्वीर में हमें कोई लिखावट नहीं मिली। कृपया तस्वीर के साथ आया मैसेज लिखें।",
      unreadable_link: "यह लिंक नहीं खुल सका। कृपया मैसेज या लेख का टेक्स्ट डालें।",
      server_error: "जाँच के दौरान कुछ गड़बड़ हो गई। कृपया दोबारा कोशिश करें।",
    },
  },
  mr: {
    title: "हे खरे आहे का?",
    subtitle: "WhatsApp वर एखादा मेसेज आला आहे? तो खाली टाका, आम्ही विश्वासार्ह स्रोतांवरून त्याची तपासणी करू.",
    inputLabel: "तुम्हाला आलेला मेसेज किंवा लिंक इथे टाका",
    placeholder: "उदा. सरकार प्रत्येक नागरिकाला ₹५००० देत आहे, शुक्रवारपूर्वी अर्ज करा…",
    placeholderWithImage: "हवे असल्यास चित्रासोबत आलेला मेसेजही लिहा…",
    addImage: "📷 फोटो किंवा स्क्रीनशॉट जोडा",
    removeImage: "✕ चित्र काढा",
    imageAlt: "तुम्ही जोडलेले चित्र",
    check: "हा मेसेज तपासा",
    checking: "तुमचा मेसेज तपासला जात आहे…",
    usuallyTakes: "याला साधारण १५–३० सेकंद लागतात.",
    cancel: "रद्द करा",
    steps: {
      readImage: "चित्र वाचले जात आहे",
      findClaims: "मेसेजमधील दावे शोधले जात आहेत",
      search: "फॅक्ट-चेकर्स आणि बातम्या शोधल्या जात आहेत",
      judge: "प्रत्येक दावा तपासला जात आहे",
    },
    youChecked: "तुम्ही हे तपासले",
    checkAnother: "🔁 दुसरा मेसेज तपासा",
    errors: {
      too_short: "कृपया थोडा मोठा मेसेज टाका.",
      too_long: "हा मेसेज खूप मोठा आहे. कृपया त्याचा छोटा भाग टाका.",
      no_message: "कृपया तपासण्यासाठी मेसेज टाका.",
      no_image: "कृपया तपासण्यासाठी चित्र निवडा.",
      bad_image_type: "कृपया JPG, PNG किंवा WebP चित्र निवडा.",
      image_too_large: "हे चित्र खूप मोठे आहे. कृपया ५ MB पेक्षा लहान चित्र निवडा.",
      image_unreadable: "हे चित्र उघडता आले नाही. कृपया JPG किंवा PNG स्क्रीनशॉट वापरून पाहा.",
      no_text_in_image: "या चित्रात आम्हाला कोणताही मजकूर सापडला नाही. कृपया चित्रासोबत आलेला मेसेज लिहा.",
      unreadable_link: "ही लिंक उघडता आली नाही. कृपया मेसेज किंवा लेखाचा मजकूर टाका.",
      server_error: "तपासणी करताना काहीतरी चुकले. कृपया पुन्हा प्रयत्न करा.",
    },
  },
};

export function getUiText(language: UiLanguage): UiText {
  return TEXT[language];
}

// First visit: use the phone's language if it's one we support, otherwise English.
export function detectLanguage(preferred: readonly string[]): UiLanguage {
  for (const tag of preferred) {
    const code = tag.toLowerCase().split("-")[0];
    if (code === "hi" || code === "mr" || code === "en") return code;
  }
  return "en";
}
