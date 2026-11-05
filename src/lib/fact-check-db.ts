import "server-only";

// Google Fact Check Tools API: published fact-checks (ClaimReview) from outlets like
// AFP, BOOM, Factly and India Today. https://developers.google.com/fact-check/tools/api
const ENDPOINT = "https://factchecktools.googleapis.com/v1alpha1/claims:search";

export type PublishedFactCheck = {
  publisher: string;
  rating: string; // as the fact-checker wrote it: "False", "भ्रामक", or a whole sentence
  title: string;
  url: string;
  reviewDate?: string;
  claimReviewed: string;
  claimant?: string;
};

type ApiResponse = {
  claims?: {
    text?: string;
    claimant?: string;
    claimReview?: {
      publisher?: { name?: string; site?: string };
      url?: string;
      title?: string;
      reviewDate?: string;
      textualRating?: string;
    }[];
  }[];
};

// The API matches keywords strictly, so callers should pass several short queries.
// Failures return no results: the web search still runs, so a check never fails because of this.
export async function searchFactChecks(queries: string[], limit = 4): Promise<PublishedFactCheck[]> {
  const key = process.env.GOOGLE_FACT_CHECK_API_KEY;
  if (!key) return [];

  const resultSets = await Promise.all(queries.map((q) => searchOne(q, key)));
  const byUrl = new Map(resultSets.flat().map((f) => [f.url, f]));
  return [...byUrl.values()].slice(0, limit);
}

async function searchOne(query: string, key: string): Promise<PublishedFactCheck[]> {
  const url = `${ENDPOINT}?${new URLSearchParams({ query, key, pageSize: "5" })}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: ApiResponse = await res.json();

    return (data.claims ?? []).flatMap((claim) =>
      (claim.claimReview ?? [])
        .filter((r) => r.url && r.textualRating)
        .map((r) => ({
          publisher: r.publisher?.name || r.publisher?.site || new URL(r.url!).hostname,
          rating: r.textualRating!,
          title: r.title || claim.text || r.url!,
          url: r.url!,
          reviewDate: r.reviewDate?.slice(0, 10),
          claimReviewed: claim.text ?? "",
          claimant: claim.claimant,
        })),
    );
  } catch (err) {
    console.error("fact-check search failed", { query, err });
    return [];
  }
}
