import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAuthorizedParties } from "../lib/authorizedParties";

test("no configured list leaves sign-in unrestricted, as before", () => {
  assert.equal(resolveAuthorizedParties(undefined), undefined);
  assert.equal(resolveAuthorizedParties("", ["https://preview.example"]), undefined);
});

test("keeps the configured list", () => {
  assert.deepEqual(resolveAuthorizedParties(" https://a.example , https://b.example "), [
    "https://a.example",
    "https://b.example",
  ]);
});

test("adds the deploy's own https origins, without duplicates", () => {
  assert.deepEqual(
    resolveAuthorizedParties("https://beta.example", [
      "https://beta.example/",
      "https://deploy-preview-12--beta.example/some/path",
      "http://insecure.example",
      "not a url",
    ]),
    ["https://beta.example", "https://deploy-preview-12--beta.example"],
  );
});
