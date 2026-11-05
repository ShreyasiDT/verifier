import "server-only";
import Exa from "exa-js";

const exa = new Exa(process.env.EXA_API_KEY);

export type SearchResult = {
  title: string;
  url: string;
  publishedDate?: string;
  text: string;
};

export async function searchWeb(query: string, numResults = 6): Promise<SearchResult[]> {
  const { results } = await exa.search(query, {
    numResults,
    contents: { text: { maxCharacters: 3000 } },
  });

  return results
    .filter((r) => r.text)
    .map((r) => ({
      title: r.title ?? r.url,
      url: r.url,
      publishedDate: r.publishedDate ?? undefined,
      text: r.text,
    }));
}
