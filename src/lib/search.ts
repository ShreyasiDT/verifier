import "server-only";
import Exa from "exa-js";

const exa = new Exa(process.env.EXA_API_KEY);

export type SearchResult = {
  title: string;
  url: string;
  publishedDate?: string;
  text: string;
};

// A failed search returns no results instead of throwing, so one bad query doesn't sink the whole check.
export async function searchWeb(query: string, numResults = 6): Promise<SearchResult[]> {
  let results;
  try {
    ({ results } = await exa.search(query, {
      numResults,
      contents: { text: { maxCharacters: 3000 } },
    }));
  } catch (err) {
    console.error("search failed", { query, err });
    return [];
  }

  return results
    .filter((r) => r.text)
    .map((r) => ({
      title: r.title ?? r.url,
      url: r.url,
      publishedDate: r.publishedDate ?? undefined,
      text: r.text,
    }));
}

export type LinkedPage = { url: string; title: string; publishedDate?: string; text: string };

// Read pages through Exa rather than fetching them ourselves, so a pasted link can never make our
// server request internal addresses. Pages Exa can't open are simply missing from the result.
export async function readPages(urls: string[], maxCharacters = 6000): Promise<LinkedPage[]> {
  if (urls.length === 0) return [];
  try {
    const { results } = await exa.getContents(urls, { text: { maxCharacters }, maxAgeHours: 168 });
    return results
      .filter((r) => r.text || r.title)
      .map((r) => ({
        url: r.url,
        title: r.title ?? r.url,
        publishedDate: r.publishedDate ?? undefined,
        text: r.text ?? "",
      }));
  } catch (err) {
    console.error("reading pages failed", { urls, err });
    return [];
  }
}
