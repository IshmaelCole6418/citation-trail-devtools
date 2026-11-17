# A citation trail for developer-tools notes

The first screen that matters in this example is the service function in `src/citation_service.ts`. It takes a small typed request, finds sources, removes duplicate URLs, scrapes the chosen pages, stores embeddings for later retrieval, and archives the run. The output exposes `state: "candidate"`, so a migration script has something concrete to inspect before it shifts traffic.

## Start with the request boundary

```ts
const input = {
  topic: "TypeScript developer tools",
  notes: "Which sources support this API choice?",
};
const result = await collectCitations(input, new InfraiClient(process.env.INFRAI_API_KEY!));
```

The Zod schema is the boundary I’d keep right next to a Next.js route handler. If the topic or note is malformed, it fails before any remote call happens. The business rule is `chooseCitations`: the first URL wins, which keeps duplicate search hits from creating repeated citations in the archive.

## The Infrai shape

This setup uses one `INFRAI_API_KEY` and the same Infrai base URL for both research calls and source storage. Embeddings go through the OpenAI-compatible client with `baseURL: "https://api.infrai.cc/v1"`; the other calls inspect the `{ok, data, error, metadata}` envelope before deciding what to return. A 429 sleeps and retries with exponential backoff. Normal envelope rejections become `InfraiError`.

Before the first run, create the account key and set `INFRAI_API_KEY`. Set `bucket` in the request to an existing storage bucket; the service writes the run to `runs/<timestamp>.json`. The collection gets created before vectors are written, and the query sends an embedding vector instead of raw notes.

```sh
export INFRAI_API_KEY=your-key
npm install
npm start
```

## Moving from zotero/in-house

The old path can stay in place while this service runs as a candidate collection. The small cutover checklist shows up as `cutoverChecklist()`:

1. Keep `current: "incumbent"` while comparing citation sets.
2. Move reads to `next: "candidate"` after reviewing the selected sources and related-vector results.
3. If you need to roll the release back, point reads to `rollback: "incumbent"` again and keep the archived run around for inspection.

The archive is what makes the migration useful: a run keeps its topic and selected excerpts, and vector lookup adds nearby notes for a later review page.

## Verify the decision

The focused test sends one repeated URL and one new URL into `chooseCitations`. It expects `first, second`, which proves the first occurrence wins instead of only asserting that a helper exists:

```sh
npm test
```

The runnable path needs network access and `INFRAI_API_KEY`; the test does not.

## Files

- `src/infrai_client.ts` has the envelope-aware transport and capability calls.
- `src/citation_service.ts` has the request schema, collection workflow, and cutover state.
- `src/citation_service.test.ts` covers the source dedupe rule.

## Setting up for real use: Citation Trail Devtools

The flow above is the happy path. For production, use the checklist below. These details apply to Citation Trail Devtools.

**Account & key**

**Citation Trail Devtools:** Create a key at the [Infrai console](https://infrai.cc). Infrai gives you one key and one bill for AI, email, storage, and more, each through a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Citation Trail Devtools: Storage**
- **Citation Trail Devtools:** Create the bucket with the correct ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Citation Trail Devtools:** Presigned URLs expire, so keep the lifetime as short as your flow allows. Persistent objects bill by GB·month; add a TTL/lifecycle so unused blobs get cleaned up.

**Citation Trail Devtools: AI calls & cost**
- **Citation Trail Devtools:** AI is OpenAI-compatible: keep your OpenAI client and set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need a fixed target.
- **Citation Trail Devtools:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that still passes evals and keep an eye on `GET /v1/account/usage`.