import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  getAuthorizedResource,
  requireResourceAccess,
} from "./resourceAccess.ts";

function createResponseRecorder() {
  const recorder = {
    statusCode: 200,
    body: undefined,
  };

  const response = {
    status(statusCode) {
      recorder.statusCode = statusCode;
      return response;
    },
    json(body) {
      recorder.body = body;
      return response;
    },
  };

  return { recorder, response };
}

async function runGuard({ method, requestData, resolveId, resourceId }) {
  const lookupCalls = [];
  const ownedResource = { id: 101, owner: "clerk-user-a" };
  const resources = new Map([
    [ownedResource.id, ownedResource],
    [202, { id: 202, owner: "clerk-user-b" }],
  ]);
  const lookup = async (clerkUserId, requestedId) => {
    lookupCalls.push([clerkUserId, requestedId]);
    const resource = resources.get(requestedId);
    return resource?.owner === clerkUserId ? resource : null;
  };

  const guard = requireResourceAccess({
    resolveId,
    lookup,
    invalidIdError: "Invalid resource id",
    notFoundError: "Resource not found",
  });
  const request = {
    method,
    params: {},
    query: {},
    body: {},
    clerkUserId: "clerk-user-a",
    ...requestData,
  };
  const { recorder, response } = createResponseRecorder();
  const nextCalls = [];

  await guard(request, response, (error) => nextCalls.push(error));

  return {
    lookupCalls,
    nextCalls,
    ownedResource,
    recorder,
    request,
    resourceId,
  };
}

const routeCases = [
  {
    method: "GET",
    requestData: (id) => ({ params: { weddingId: String(id) } }),
    resolveId: (req) => req.params.weddingId,
  },
  {
    method: "POST",
    requestData: (id) => ({ body: { weddingId: id } }),
    resolveId: (req) => req.body.weddingId,
  },
  {
    method: "PATCH",
    requestData: (id) => ({ params: { id: String(id) } }),
    resolveId: (req) => req.params.id,
  },
  {
    method: "DELETE",
    requestData: (id) => ({ params: { id: String(id) } }),
    resolveId: (req) => req.params.id,
  },
];

describe("resource authorization guard", () => {
  for (const routeCase of routeCases) {
    test(`${routeCase.method} hides both foreign and missing resources`, async () => {
      const foreign = await runGuard({
        ...routeCase,
        requestData: routeCase.requestData(202),
        resourceId: 202,
      });
      const missing = await runGuard({
        ...routeCase,
        requestData: routeCase.requestData(999),
        resourceId: 999,
      });

      assert.equal(foreign.recorder.statusCode, 404);
      assert.deepEqual(foreign.recorder.body, { error: "Resource not found" });
      assert.deepEqual(missing.recorder, foreign.recorder);
      assert.deepEqual(foreign.lookupCalls, [["clerk-user-a", 202]]);
      assert.deepEqual(missing.lookupCalls, [["clerk-user-a", 999]]);
      assert.equal(foreign.nextCalls.length, 0);
      assert.equal(missing.nextCalls.length, 0);
    });
  }

  test("attaches an owned resource before continuing", async () => {
    const result = await runGuard({
      method: "GET",
      requestData: { params: { weddingId: "101" } },
      resolveId: (req) => req.params.weddingId,
      resourceId: 101,
    });

    assert.equal(result.recorder.statusCode, 200);
    assert.equal(result.nextCalls.length, 1);
    assert.equal(result.nextCalls[0], undefined);
    assert.equal(getAuthorizedResource(result.request), result.ownedResource);
  });

  test("fails closed when requireAuth was not run", async () => {
    const guard = requireResourceAccess({
      resolveId: (req) => req.params.id,
      lookup: async () => ({ id: 101 }),
      invalidIdError: "Invalid resource id",
      notFoundError: "Resource not found",
    });
    const request = {
      method: "GET",
      params: { id: "101" },
      query: {},
      body: {},
    };
    const { recorder, response } = createResponseRecorder();

    await guard(request, response, () => {
      throw new Error("next should not be called");
    });

    assert.equal(recorder.statusCode, 401);
    assert.deepEqual(recorder.body, { error: "Unauthorized" });
  });

  test("rejects malformed and out-of-range IDs before lookup", async () => {
    let lookupCalls = 0;
    const guard = requireResourceAccess({
      resolveId: (req) => req.params.id,
      lookup: async () => {
        lookupCalls += 1;
        return { id: 101 };
      },
      invalidIdError: "Invalid resource id",
      notFoundError: "Resource not found",
    });

    for (const id of [
      "",
      "0",
      "-1",
      "1.5",
      "0x10",
      "1e2",
      "2147483648",
      "99999999999999999999",
    ]) {
      const request = {
        method: "GET",
        params: { id },
        query: {},
        body: {},
        clerkUserId: "clerk-user-a",
      };
      const { recorder, response } = createResponseRecorder();

      await guard(request, response, () => {
        throw new Error("next should not be called");
      });

      assert.equal(recorder.statusCode, 400);
      assert.deepEqual(recorder.body, { error: "Invalid resource id" });
    }

    assert.equal(lookupCalls, 0);
  });
});
