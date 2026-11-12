import { z } from "zod";
import { InfraiClient } from "./infrai_client.ts";

export const citationRequest = z.object({
  topic: z.string().min(3),
  notes: z.string().min(3),
  collection: z.string().min(1).default("devtools-citations"),
  bucket: z.string().min(1).default("devtools-citations"),
});

export type CitationRequest = z.infer<typeof citationRequest>;
export type Cutover = "incumbent" | "candidate";

export function chooseCitations(items: Array<{ url: string; title?: string; snippet?: string }>) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, 5);
}

export async function collectCitations(input: unknown, client: InfraiClient) {
  const request = citationRequest.parse(input);
  const results = await client.search(request.topic);
  const citations = chooseCitations(results.items ?? []);
  const enriched = await Promise.all(citations.map(async (citation) => ({
    ...citation,
    excerpt: (await client.scrape(citation.url)).content.slice(0, 600),
  })));
  const vectors = await Promise.all(enriched.map(async (citation) => ({
    id: citation.url,
    values: await client.embeddings(`${citation.title ?? ""} ${citation.excerpt}`),
    metadata: citation,
  })));
  await client.createCollection(request.collection, vectors[0]?.values.length ?? 1);
  await client.upsert(request.collection, vectors);
  const related = await client.query(request.collection, await client.embeddings(request.notes));
  const objectKey = `runs/${Date.now()}.json`;
  await client.putObject(request.bucket, objectKey, Buffer.from(JSON.stringify({ topic: request.topic, citations: enriched })).toString("base64"));
  return { state: "candidate", citations: enriched, related };
}

export function cutoverChecklist(): { current: Cutover; next: Cutover; rollback: Cutover } {
  return { current: "incumbent", next: "candidate", rollback: "incumbent" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const input = { topic: process.env.CITATION_TOPIC ?? "TypeScript developer tools", notes: "Which sources support this API choice?" };
  collectCitations(input, new InfraiClient(key)).then((result) => console.log(JSON.stringify(result, null, 2)));
}
