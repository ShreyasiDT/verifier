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
