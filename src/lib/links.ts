// Links people paste: full URLs, or bare "www." ones that WhatsApp also turns into links.
// Trailing punctuation is dropped so "see https://x.com/a." doesn't include the full stop.
export const LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}]/gi;

export function findLinks(message: string, limit = 2): string[] {
  const links = (message.match(LINK_PATTERN) ?? []).map((l) => (l.startsWith("http") ? l : `https://${l}`));
  return [...new Set(links)].slice(0, limit);
}

export function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// True when the message is little more than the link(s), so the article is what needs checking.
export function isMostlyLinks(message: string) {
  return message.replace(LINK_PATTERN, "").replace(/\s+/g, " ").trim().length < 20;
}
