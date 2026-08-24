import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, describe, test } from "node:test";
import express from "express";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:1/test";
process.env.OPENAI_API_KEY ??= "sk-test-not-a-real-key";

const dbModule = await import("@workspace/db");
const { db, quotesTable, timelinesTable, usersTable, weddingsTable } = dbModule;
const { openai } = await import("@workspace/integrations-openai-ai-server");
const { default: apiRouter } = await import("../routes/index");

type OperationKind = "select" | "insert" | "update" | "delete";

interface FakeDbOperation {
  kind: OperationKind;
  table?: unknown;
  selection?: unknown;
  values?: unknown;
  joins: unknown[];
  where?: unknown[];
  orderBy?: unknown[];
  limit?: number;
  returning?: boolean;
}

interface FakeDbPlan {
  selects?: unknown[];
  inserts?: unknown[];
  updates?: unknown[];
  deletes?: unknown[];
}

interface FakeDbHarness {
  operations: FakeDbOperation[];
  restore: () => void;
}

interface AwaitableBuilder extends PromiseLike<unknown> {
  from: (table: unknown) => AwaitableBuilder;
  innerJoin: (table: unknown, condition: unknown) => AwaitableBuilder;
  where: (...conditions: unknown[]) => AwaitableBuilder;
  orderBy: (...values: unknown[]) => AwaitableBuilder;
  limit: (value: number) => AwaitableBuilder;
  values: (value: unknown) => AwaitableBuilder;
  set: (value: unknown) => AwaitableBuilder;
  returning: () => Promise<unknown>;
  catch: (onRejected: (reason: unknown) => unknown) => Promise<unknown>;
  finally: (onFinally: () => void) => Promise<unknown>;
}

function createBuilder(
  operation: FakeDbOperation,
  result: unknown,
): AwaitableBuilder {
  const promise = () => Promise.resolve(result);
  const builder = {
    from(table: unknown) {
      operation.table = table;
      return builder;
    },
    innerJoin(table: unknown, _condition: unknown) {
      operation.joins.push(table);
      return builder;
    },
    where(...conditions: unknown[]) {
      operation.where = conditions;
      return builder;
    },
    orderBy(...values: unknown[]) {
      operation.orderBy = values;
      return builder;
    },
    limit(value: number) {
      operation.limit = value;
      return builder;
    },
    values(value: unknown) {
      operation.values = value;
      return builder;
    },
    set(value: unknown) {
      operation.values = value;
      return builder;
    },
    returning() {
      operation.returning = true;
      return promise();
    },
    then<TResult1 = unknown, TResult2 = never>(
      onFulfilled?:
        ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?:
        ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return promise().then(onFulfilled, onRejected);
    },
    catch(onRejected: (reason: unknown) => unknown) {
      return promise().catch(onRejected);
    },
    finally(onFinally: () => void) {
      return promise().finally(onFinally);
    },
  };

  return builder;
}

function installFakeDb(plan: FakeDbPlan = {}): FakeDbHarness {
  const results = {
    selects: [...(plan.selects ?? [])],
    inserts: [...(plan.inserts ?? [])],
    updates: [...(plan.updates ?? [])],
    deletes: [...(plan.deletes ?? [])],
  };
  const operations: FakeDbOperation[] = [];
  const mutableDb = db as unknown as Record<
    string,
    (...args: unknown[]) => unknown
  >;
  const originals = {
    select: mutableDb.select,
    insert: mutableDb.insert,
    update: mutableDb.update,
    delete: mutableDb.delete,
  };

  const nextResult = (kind: keyof typeof results, required: boolean) => {
    if (results[kind].length === 0) {
      if (required) {
        throw new Error(`No queued fake database result for ${kind}`);
      }
      return [];
    }
    return results[kind].shift();
  };

  mutableDb.select = (selection?: unknown) => {
    const operation: FakeDbOperation = {
      kind: "select",
      selection,
      joins: [],
    };
    operations.push(operation);
    return createBuilder(operation, nextResult("selects", true));
  };

  mutableDb.insert = (table: unknown) => {
    const operation: FakeDbOperation = { kind: "insert", table, joins: [] };
    operations.push(operation);
    return createBuilder(operation, nextResult("inserts", false));
  };

  mutableDb.update = (table: unknown) => {
    const operation: FakeDbOperation = { kind: "update", table, joins: [] };
    operations.push(operation);
    return createBuilder(operation, nextResult("updates", false));
  };

  mutableDb.delete = (table: unknown) => {
    const operation: FakeDbOperation = { kind: "delete", table, joins: [] };
    operations.push(operation);
    return createBuilder(operation, nextResult("deletes", false));
  };

  return {
    operations,
    restore() {
      Object.assign(mutableDb, originals);
    },
  };
}

interface AiFixture {
  content: string;
  finishReason?: string;
}

interface AiHarness {
  calls: unknown[];
  restore: () => void;
}

function installAiMock(fixtures: AiFixture[] = []): AiHarness {
  const queued = [...fixtures];
  const calls: unknown[] = [];
  const completions = openai.chat.completions as unknown as {
    create: (request: unknown) => Promise<unknown>;
  };
  const originalCreate = completions.create;

  completions.create = async (request: unknown) => {
    calls.push(request);
    const fixture = queued.shift();
    if (!fixture) {
      throw new Error(
        "Unexpected OpenAI call: no deterministic fixture queued",
      );
    }
    return {
      choices: [
        {
          finish_reason: fixture.finishReason ?? "stop",
          message: { content: fixture.content },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    };
  };

  return {
    calls,
    restore() {
      completions.create = originalCreate;
    },
  };
}

async function withHarness(
  plan: FakeDbPlan,
  fixtures: AiFixture[],
  run: (harness: { db: FakeDbHarness; ai: AiHarness }) => Promise<void>,
) {
  const dbHarness = installFakeDb(plan);
  const aiHarness = installAiMock(fixtures);
  try {
    await run({ db: dbHarness, ai: aiHarness });
  } finally {
    aiHarness.restore();
    dbHarness.restore();
  }
}

const clerkAuthBrand = Symbol.for("@clerk/express.auth");
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = req.header("x-test-user-id");
  const email = req.header("x-test-user-email") ?? "planner@example.com";
  const authObject = userId
    ? {
        userId,
        sessionId: "session-test",
        sessionClaims: { email },
        tokenType: "session_token",
      }
    : {
        userId: null,
        sessionId: null,
        sessionClaims: null,
        tokenType: "session_token",
      };

  (req as unknown as { auth: unknown }).auth = Object.assign(() => authObject, {
    [clerkAuthBrand]: true,
  });
  next();
});
app.use("/api", apiRouter);

let server: Server;
let apiBaseUrl: string;

before(async () => {
  server = await new Promise<Server>((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () => {
      resolve(listeningServer);
    });
  });
  const address = server.address() as AddressInfo;
  apiBaseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await dbModule.pool.end();
});

interface ApiRequestOptions {
  method?: string;
  userId?: string | null;
  email?: string;
  body?: unknown;
}

async function apiRequest(
  path: string,
  {
    method = "GET",
    userId = "clerk-user-a",
    email = "planner@example.com",
    body,
  }: ApiRequestOptions = {},
) {
  const headers = new Headers();
  if (userId) headers.set("x-test-user-id", userId);
  if (email) headers.set("x-test-user-email", email);
  if (body !== undefined) headers.set("content-type", "application/json");

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const responseText = await response.text();
  return {
    status: response.status,
    body: responseText ? (JSON.parse(responseText) as unknown) : null,
  };
}

async function waitFor(condition: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for background workflow");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const createdAt = new Date("2026-08-24T12:00:00.000Z");
const user = {
  id: 1,
  clerkId: "clerk-user-a",
  email: "planner@example.com",
  createdAt,
};
const generatingWedding = {
  id: 10,
  userId: user.id,
  weddingDate: "2027-06-12",
  city: "Asbury Park, NJ",
  guestCount: 120,
  style: "standard" as const,
  generationStatus: "generating" as const,
  retryCount: 0,
  generationError: null,
  createdAt,
};
const readyWedding = {
  ...generatingWedding,
  generationStatus: "ready" as const,
};
const timelineWeeks = [
  {
    weekLabel: "Month 12",
    phase: "12+ months out",
    tasks: [{ title: "Set the budget", priority: "urgent" as const }],
  },
];
const timeline = {
  id: 20,
  weddingId: readyWedding.id,
  generatedAt: createdAt,
  tasks: timelineWeeks,
};
const quote = {
  id: 30,
  weddingId: readyWedding.id,
  vendorName: "Garden State Photo",
  category: "photography" as const,
  rawText: "Photography package total $2500",
  lineItems: [
    { item: "Photography package", quantity: 1, unitPrice: 2500, total: 2500 },
  ],
  totalAmount: 2500,
  currency: "USD",
  parsedAt: createdAt,
  createdAt,
  selectedAt: null,
};

describe("critical MVP API flows", { concurrency: false }, () => {
  test("requires a verified Clerk user before protected work", async () => {
    await withHarness({}, [], async ({ db: dbHarness, ai }) => {
      const response = await apiRequest("/timelines/current", { userId: null });

      assert.equal(response.status, 401);
      assert.deepEqual(response.body, { error: "Unauthorized" });
      assert.equal(dbHarness.operations.length, 0);
      assert.equal(ai.calls.length, 0);
    });
  });

  test("provisions the current user from verified Clerk claims", async () => {
    await withHarness(
      { selects: [[]], inserts: [[user]] },
      [],
      async ({ db: dbHarness, ai }) => {
        const response = await apiRequest("/users/me", {
          method: "POST",
          email: user.email,
        });

        assert.equal(response.status, 201);
        assert.equal((response.body as typeof user).id, user.id);
        assert.equal((response.body as typeof user).email, user.email);

        const insert = dbHarness.operations.find(
          (operation) =>
            operation.kind === "insert" && operation.table === usersTable,
        );
        assert.deepEqual(insert?.values, {
          clerkId: user.clerkId,
          email: user.email,
        });
        assert.equal(ai.calls.length, 0);
      },
    );
  });

  test("onboards a wedding and stores a deterministic generated timeline", async () => {
    await withHarness(
      {
        selects: [[user], []],
        inserts: [[generatingWedding], []],
        updates: [[]],
        deletes: [[]],
      },
      [{ content: JSON.stringify({ weeks: timelineWeeks }) }],
      async ({ db: dbHarness, ai }) => {
        const response = await apiRequest("/timelines/generate", {
          method: "POST",
          body: {
            weddingDate: generatingWedding.weddingDate,
            city: generatingWedding.city,
            guestCount: generatingWedding.guestCount,
            style: generatingWedding.style,
          },
        });

        assert.equal(response.status, 202);
        assert.deepEqual(response.body, {
          weddingId: generatingWedding.id,
          status: "generating",
        });

        await waitFor(() =>
          dbHarness.operations.some(
            (operation) =>
              operation.kind === "update" &&
              operation.table === weddingsTable &&
              (operation.values as { generationStatus?: string })
                ?.generationStatus === "ready",
          ),
        );

        const weddingInsert = dbHarness.operations.find(
          (operation) =>
            operation.kind === "insert" && operation.table === weddingsTable,
        );
        assert.deepEqual(weddingInsert?.values, {
          userId: user.id,
          weddingDate: generatingWedding.weddingDate,
          city: generatingWedding.city,
          guestCount: generatingWedding.guestCount,
          style: generatingWedding.style,
        });

        const timelineInsert = dbHarness.operations.find(
          (operation) =>
            operation.kind === "insert" && operation.table === timelinesTable,
        );
        assert.deepEqual(timelineInsert?.values, {
          weddingId: generatingWedding.id,
          tasks: timelineWeeks,
        });
        assert.equal(ai.calls.length, 1);
        assert.equal((ai.calls[0] as { model: string }).model, "gpt-5-nano");
      },
    );
  });

  test("returns current timeline state and retries a failed generation", async () => {
    const failedWedding = {
      ...generatingWedding,
      generationStatus: "failed" as const,
      retryCount: 2,
      generationError: "provider timeout",
    };

    await withHarness(
      {
        selects: [
          [user],
          [readyWedding],
          [timeline],
          [{ wedding: failedWedding }],
        ],
        inserts: [[]],
        updates: [[], []],
        deletes: [[]],
      },
      [{ content: JSON.stringify({ weeks: timelineWeeks }) }],
      async ({ db: dbHarness, ai }) => {
        const currentResponse = await apiRequest("/timelines/current");
        assert.equal(currentResponse.status, 200);
        assert.equal(
          (currentResponse.body as { status: string }).status,
          "ready",
        );
        assert.equal(
          (currentResponse.body as { wedding: { id: number } }).wedding.id,
          readyWedding.id,
        );

        const retryResponse = await apiRequest(
          `/timelines/${failedWedding.id}/retry`,
          { method: "POST" },
        );
        assert.equal(retryResponse.status, 202);
        assert.deepEqual(retryResponse.body, {
          weddingId: failedWedding.id,
          status: "generating",
        });

        await waitFor(
          () =>
            dbHarness.operations.filter(
              (operation) =>
                operation.kind === "update" &&
                operation.table === weddingsTable,
            ).length === 2,
        );

        const weddingUpdates = dbHarness.operations.filter(
          (operation) =>
            operation.kind === "update" && operation.table === weddingsTable,
        );
        assert.deepEqual(weddingUpdates[0]?.values, {
          generationStatus: "generating",
          retryCount: failedWedding.retryCount + 1,
          generationError: null,
        });
        assert.deepEqual(weddingUpdates[1]?.values, {
          generationStatus: "ready",
          generationError: null,
        });
        assert.equal(ai.calls.length, 1);
      },
    );
  });

  test("ingests and selects a quote using a mocked AI completion", async () => {
    const selectedQuote = { ...quote, selectedAt: createdAt };
    const parsedQuote = {
      currency: quote.currency,
      lineItems: quote.lineItems,
      totalAmount: quote.totalAmount,
    };

    await withHarness(
      {
        selects: [
          [{ wedding: readyWedding }],
          [{ quote, wedding: readyWedding }],
        ],
        inserts: [[quote]],
        updates: [[], [selectedQuote]],
      },
      [{ content: JSON.stringify(parsedQuote) }],
      async ({ db: dbHarness, ai }) => {
        const createResponse = await apiRequest("/quotes", {
          method: "POST",
          body: {
            weddingId: readyWedding.id,
            vendorName: quote.vendorName,
            category: quote.category,
            rawText: quote.rawText,
          },
        });
        assert.equal(createResponse.status, 201);
        assert.equal(
          (createResponse.body as { quote: { id: number } }).quote.id,
          quote.id,
        );

        const quoteInsert = dbHarness.operations.find(
          (operation) =>
            operation.kind === "insert" && operation.table === quotesTable,
        );
        assert.deepEqual(quoteInsert?.values, {
          weddingId: readyWedding.id,
          vendorName: quote.vendorName,
          category: quote.category,
          rawText: quote.rawText,
          lineItems: quote.lineItems,
          totalAmount: quote.totalAmount,
          currency: quote.currency,
        });

        const selectResponse = await apiRequest(`/quotes/${quote.id}/select`, {
          method: "PATCH",
        });
        assert.equal(selectResponse.status, 200);
        assert.equal(
          (selectResponse.body as { quote: { id: number } }).quote.id,
          quote.id,
        );

        const quoteUpdates = dbHarness.operations.filter(
          (operation) =>
            operation.kind === "update" && operation.table === quotesTable,
        );
        assert.deepEqual(quoteUpdates[0]?.values, { selectedAt: null });
        assert.ok(
          (quoteUpdates[1]?.values as { selectedAt?: unknown })
            .selectedAt instanceof Date,
        );
        assert.equal(ai.calls.length, 1);
      },
    );
  });

  test("hides foreign wedding and quote IDs without mutating data", async () => {
    await withHarness(
      { selects: [[], []] },
      [],
      async ({ db: dbHarness, ai }) => {
        const timelineResponse = await apiRequest("/timelines/999");
        const quoteResponse = await apiRequest("/quotes/999", {
          method: "DELETE",
        });

        assert.equal(timelineResponse.status, 404);
        assert.deepEqual(timelineResponse.body, { error: "Wedding not found" });
        assert.equal(quoteResponse.status, 404);
        assert.deepEqual(quoteResponse.body, { error: "Quote not found" });
        assert.ok(
          dbHarness.operations.every(
            (operation) => operation.kind === "select",
          ),
        );
        assert.equal(ai.calls.length, 0);
      },
    );
  });
});
