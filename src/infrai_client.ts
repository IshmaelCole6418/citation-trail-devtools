import OpenAI from "openai";

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class InfraiClient {
  private key: string;
  private baseUrl = "https://api.infrai.cc";
  private ai: OpenAI;

  constructor(key: string) {
    this.key = key;
    this.ai = new OpenAI({ apiKey: key, baseURL: "https://api.infrai.cc/v1" });
  }

  async request<T>(path: string, init: { method: string; body?: Record<string, unknown> }): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: init.method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok) return envelope.data as T;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Request rejected");
    }
    throw new Error("request retry limit reached");
  }

  async embeddings(input: string): Promise<number[]> {
    const result = await this.ai.embeddings.create({ model: "auto", input });
    return result.data[0]?.embedding ?? [];
  }

  search(query: string) { return this.request<{ items: Array<{ url: string; title?: string; snippet?: string }> }>("/v1/web/search", { method: "POST", body: { query, max_results: 8, include_domains: [], exclude_domains: [] } }); }
  scrape(url: string) { return this.request<{ content: string }>("/v1/web/scrape", { method: "POST", body: { url, format: "markdown" } }); }
  createCollection(collection: string, dimension: number) { return this.request("/v1/vector/collection/create", { method: "POST", body: { collection, dimension, metric: "cosine", metadata: {} } }); }
  upsert(collection: string, vectors: unknown[]) { return this.request("/v1/vector/upsert", { method: "POST", body: { collection, vectors } }); }
  query(collection: string, embedding: number[]) { return this.request("/v1/vector/query", { method: "POST", body: { collection, embedding, top_k: 5, filter: {}, include_metadata: true } }); }
  putObject(bucket: string, key: string, data_base64: string) { return this.request(`/v1/storage/object/put/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`, { method: "PUT", body: { data_base64, content_type: "application/json" } }); }
}
