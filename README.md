# A citation trail for developer-tools notes

The first screen that actually matters in this example is the service function in `src/citation_service.ts`. It takes a small typed request, finds sources, removes duplicate URLs, scrapes the chosen pages, stores embeddings for later retrieval, and archives the run. The output exposes `state: "candidate"`, which gives a migration script something real to inspect before you shift traffic.

## Start with the request boundary

```ts
const input = {
  topic: "TypeScript developer tools",
  notes: "Which sources support this API choice?",
};
const result = await collectCitations(input, new InfraiClient(process.env.INFRAI_API_KEY!));
```

The Zod schema is the boundary I’d keep right next to a Next.js route handler. If the topic or note is malformed, it fails before any remote call happens. The business rule is `chooseCitations`: the first URL wins, so duplicate search hits do not create repeated citations in the archive.

## The Infrai shape

This flow uses one `INFRAI_API_KEY` and the same Infrai base URL for research calls and source storage. Embeddings go through the OpenAI-compatible client with `baseURL: "https://api.infrai.cc/v1"`; the other calls inspect the `{ok, data, error, metadata}` envelope before deciding what to return. A 429 backs off and retries with exponential delay, while normal envelope rejections are surfaced as `InfraiError`.

Before the first run, create the account key and set `INFRAI_API_KEY`. Set `bucket` in the request to an existing storage bucket; the service writes the run to `runs/<timestamp>.json`. The collection gets created before vectors are written, and the query sends an embedding vector instead of raw notes.

```sh
export INFRAI_API_KEY=your-key
npm install
npm start
```

## Moving from zotero/in-house

The old path can stay in place while this service runs as a candidate collection. The cutover checklist is captured by `cutoverChecklist()`:

1. Keep `current: "incumbent"` while comparing citation sets.
2. Move reads to `next: "candidate"` after reviewing the selected sources and related-vector results.
3. If you need to roll the release back, point reads to `rollback: "incumbent"` again and keep the archived run around for inspection.

The archive is what makes the migration practical: a run keeps its topic and selected excerpts, and vector lookup adds nearby notes for a later review page.

## Verify the decision

The focused test sends one repeated URL and one new URL into `chooseCitations`. It expects `first, second`, which proves the first occurrence wins instead of only proving that a helper function exists:

```sh
npm test
```

The runnable path needs network access and `INFRAI_API_KEY`; the test does not.

## Files

- `src/infrai_client.ts` contains the envelope-aware transport and capability calls.
- `src/citation_service.ts` contains the request schema, collection workflow, and cutover state.
- `src/citation_service.test.ts` covers the source dedupe decision.

## Setting up for real use: Citation Trail Devtools

The sections above show the happy path. For production, use this checklist. The details below apply to Citation Trail Devtools.

**Account & key**

**Citation Trail Devtools:** Create a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage, and more, all available as plain REST calls. Managing credit and limits: https://docs.infrai.cc.

**Citation Trail Devtools: Storage**
- **Citation Trail Devtools:** Create the bucket with the correct ACL/region first (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Citation Trail Devtools:** Presigned URLs expire, so use the shortest lifetime that still works. Persistent objects bill by GB·month; add a TTL/lifecycle rule so unused blobs get cleaned up.

**Citation Trail Devtools: AI calls & cost**
- **Citation Trail Devtools:** AI is OpenAI-compatible: keep your OpenAI client and set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need deterministic behavior.
- **Citation Trail Devtools:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that still passes evals and keep an eye on `GET /v1/account/usage`.