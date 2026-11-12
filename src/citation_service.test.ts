import assert from "node:assert/strict";
import test from "node:test";
import { chooseCitations } from "./citation_service.ts";

test("citation selection keeps the first occurrence of each URL", () => {
  const result = chooseCitations([
    { url: "https://example.dev/a", title: "first" },
    { url: "https://example.dev/a", title: "duplicate" },
    { url: "https://example.dev/b", title: "second" },
  ]);
  assert.deepEqual(result.map((item) => item.title), ["first", "second"]);
});
