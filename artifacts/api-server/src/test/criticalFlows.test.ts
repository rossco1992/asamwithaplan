import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, describe, test } from "node:test";
import express from "express";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:1/test";
process.env.OPENAI_API_KEY ??= "sk-test-not-a-real-key";

const dbModule = await import("@workspace/db");
const {
  aiWorkflowRunsTable,
  db,
  milestonesTable,
  milestoneTasksTable,
  quotesTable,
  timelinesTable,
  usersTable,
  weddingInvitesTable,
  weddingMembersTable,
  weddingsTable,
} = dbModule;
const { openai } = await import("@workspace/integrations-openai-ai-server");
const { default: apiRouter } = await import("../routes/index");
const { MILESTONE_TEMPLATES } = await import("../lib/milestoneTemplates");
const { hashInviteCode } = await import("../lib/inviteCodes");
const { dispatchTimelineGeneration } =
  await import("../services/timelineGeneration");
const { default: serverless } =
  await import("../../../../lib/serverless-http/serverless-http.js");

type OperationKind =
  | "select"
  | "insert"
  | "update"
  | "delete"
  | "transaction"
  | "execute";

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
  leftJoin: (table: unknown, condition: unknown) => AwaitableBuilder;
  where: (...conditions: unknown[]) => AwaitableBuilder;
  orderBy: (...values: unknown[]) => AwaitableBuilder;
  limit: (value: number) => AwaitableBuilder;
  values: (value: unknown) => AwaitableBuilder;
  set: (value: unknown) => AwaitableBuilder;
  onConflictDoNothing: () => AwaitableBuilder;
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
    leftJoin(table: unknown, _condition: unknown) {
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
    onConflictDoNothing() {
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
    transaction: mutableDb.transaction,
    execute: mutableDb.execute,
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

  // Raw SQL (the per-user advisory lock) is recorded and does nothing.
  mutableDb.execute = async (query: unknown) => {
    operations.push({ kind: "execute", values: query, joins: [] });
    return { rows: [] };
  };

  // Run the callback against the same fake, recording that it was a transaction.
  mutableDb.transaction = async (...args: unknown[]) => {
    const run = args[0] as (tx: unknown) => Promise<unknown>;
    operations.push({ kind: "transaction" as OperationKind, joins: [] });
    return run(db);
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

function restoreEnvironmentVariable(
  name: string,
  value: string | undefined,
): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
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
  test("adapts Express routes to Netlify's AWS-compatible function event", async () => {
    const netlifyApp = express();
    netlifyApp.get("/api/healthz", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    const handler = serverless(netlifyApp);

    const response = (await handler(
      {
        httpMethod: "GET",
        path: "/api/healthz",
        headers: { host: "beta.example.test" },
        multiValueHeaders: {},
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        body: null,
        isBase64Encoded: false,
        requestContext: {
          requestId: "netlify-test",
          identity: { sourceIp: "127.0.0.1" },
        },
      },
      {},
    )) as { statusCode: number; body: string };

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { ok: true });
  });

  test("queues timeline work through the protected Netlify background function", async () => {
    const originalFetch = globalThis.fetch;
    const originalNetlify = process.env.NETLIFY;
    const originalSiteId = process.env.SITE_ID;
    const originalUrl = process.env.URL;
    const originalSecret = process.env.NETLIFY_BACKGROUND_SECRET;
    let request: { input: string; init?: RequestInit } | undefined;

    delete process.env.NETLIFY;
    process.env.SITE_ID = "netlify-site-test";
    process.env.URL = "https://beta.example.test/";
    process.env.NETLIFY_BACKGROUND_SECRET = "test-background-secret";
    globalThis.fetch = async (input, init) => {
      request = { input: String(input), init };
      return new Response(null, { status: 202 });
    };

    try {
      await dispatchTimelineGeneration({
        runId: "00000000-0000-4000-8000-000000000001",
        requestId: "netlify-request-test",
        attempt: 1,
        weddingId: generatingWedding.id,
        weddingDate: generatingWedding.weddingDate,
        city: generatingWedding.city,
        guestCount: generatingWedding.guestCount,
        style: generatingWedding.style,
      });
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnvironmentVariable("NETLIFY", originalNetlify);
      restoreEnvironmentVariable("SITE_ID", originalSiteId);
      restoreEnvironmentVariable("URL", originalUrl);
      restoreEnvironmentVariable("NETLIFY_BACKGROUND_SECRET", originalSecret);
    }

    assert.equal(
      request?.input,
      "https://beta.example.test/.netlify/functions/timeline-generation-background",
    );
    assert.equal(request?.init?.method, "POST");
    assert.deepEqual(request?.init?.headers, {
      authorization: "Bearer test-background-secret",
      "content-type": "application/json",
    });
    assert.deepEqual(JSON.parse(String(request?.init?.body)), {
      runId: "00000000-0000-4000-8000-000000000001",
      requestId: "netlify-request-test",
      attempt: 1,
      weddingId: generatingWedding.id,
      weddingDate: generatingWedding.weddingDate,
      city: generatingWedding.city,
      guestCount: generatingWedding.guestCount,
      style: generatingWedding.style,
    });
  });

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
        selects: [[user], [], []],
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
        await waitFor(() =>
          dbHarness.operations.some(
            (operation) =>
              operation.kind === "insert" &&
              operation.table === aiWorkflowRunsTable,
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

        // The creator becomes the owner in the same transaction as the wedding.
        const kinds = dbHarness.operations.map((operation) => operation.kind);
        const weddingInsertAt = dbHarness.operations.indexOf(weddingInsert!);
        // Lock the user's plan choice, recheck, then create.
        assert.deepEqual(kinds.slice(weddingInsertAt - 3, weddingInsertAt), [
          "transaction",
          "execute",
          "select",
        ]);
        const memberInsert = dbHarness.operations[weddingInsertAt + 1];
        assert.equal(memberInsert?.table, weddingMembersTable);
        assert.deepEqual(memberInsert?.values, {
          weddingId: generatingWedding.id,
          userId: user.id,
          role: "owner",
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

        const telemetryInsert = dbHarness.operations.find(
          (operation) =>
            operation.kind === "insert" &&
            operation.table === aiWorkflowRunsTable,
        );
        const telemetry = telemetryInsert?.values as
          | Record<string, unknown>
          | undefined;
        assert.deepEqual(
          {
            workflow: telemetry?.workflow,
            model: telemetry?.model,
            status: telemetry?.status,
            attempt: telemetry?.attempt,
            promptTokens: telemetry?.promptTokens,
            completionTokens: telemetry?.completionTokens,
            totalTokens: telemetry?.totalTokens,
            estimatedCostUsd: telemetry?.estimatedCostUsd,
          },
          {
            workflow: "timeline_generation",
            model: "gpt-5-nano",
            status: "succeeded",
            attempt: 1,
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
            estimatedCostUsd: 0.0000085,
          },
        );
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
          [{ wedding: readyWedding }],
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
        await waitFor(() =>
          dbHarness.operations.some(
            (operation) =>
              operation.kind === "insert" &&
              operation.table === aiWorkflowRunsTable,
          ),
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
        const retryTelemetry = dbHarness.operations.find(
          (operation) =>
            operation.kind === "insert" &&
            operation.table === aiWorkflowRunsTable,
        );
        assert.equal(
          (retryTelemetry?.values as { attempt?: number })?.attempt,
          failedWedding.retryCount + 2,
        );
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

        const telemetryInsert = dbHarness.operations.find(
          (operation) =>
            operation.kind === "insert" &&
            operation.table === aiWorkflowRunsTable,
        );
        assert.equal(
          (telemetryInsert?.values as { workflow?: string })?.workflow,
          "quote_parsing",
        );
        assert.equal(
          (telemetryInsert?.values as { status?: string })?.status,
          "succeeded",
        );
      },
    );
  });

  test("records a categorized quote parsing failure without storing quote text in telemetry", async () => {
    await withHarness(
      {
        selects: [[{ wedding: readyWedding }]],
        inserts: [[]],
      },
      [{ content: "not valid JSON" }],
      async ({ db: dbHarness, ai }) => {
        const response = await apiRequest("/quotes", {
          method: "POST",
          body: {
            weddingId: readyWedding.id,
            vendorName: quote.vendorName,
            category: quote.category,
            rawText: quote.rawText,
          },
        });

        assert.equal(response.status, 502);
        assert.deepEqual(response.body, {
          error: "Failed to parse quote. Please try again.",
        });
        assert.equal(ai.calls.length, 1);
        assert.equal(
          dbHarness.operations.some(
            (operation) =>
              operation.kind === "insert" && operation.table === quotesTable,
          ),
          false,
        );

        const telemetryInsert = dbHarness.operations.find(
          (operation) =>
            operation.kind === "insert" &&
            operation.table === aiWorkflowRunsTable,
        );
        const telemetry = telemetryInsert?.values as
          Record<string, unknown> | undefined;
        assert.equal(telemetry?.workflow, "quote_parsing");
        assert.equal(telemetry?.status, "failed");
        assert.equal(telemetry?.errorCategory, "parsing");
        assert.equal(telemetry?.estimatedCostUsd, 0.0000085);
        assert.equal("rawText" in (telemetry ?? {}), false);
      },
    );
  });

  test("rejects timeline retries after the bounded retry limit", async () => {
    const exhaustedWedding = {
      ...generatingWedding,
      generationStatus: "failed" as const,
      retryCount: 10,
      generationError: "timeout",
    };

    await withHarness(
      { selects: [[{ wedding: exhaustedWedding }]] },
      [],
      async ({ db: dbHarness, ai }) => {
        const response = await apiRequest(
          `/timelines/${exhaustedWedding.id}/retry`,
          { method: "POST" },
        );

        assert.equal(response.status, 429);
        assert.deepEqual(response.body, {
          error: "Maximum retries reached. Please contact support.",
        });
        assert.equal(ai.calls.length, 0);
        assert.ok(
          dbHarness.operations.every(
            (operation) => operation.kind === "select",
          ),
        );
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

// ── Journey map milestones ────────────────────────────────────────────────────

function templateMilestoneRow(id: number, templateIndex: number) {
  const template = MILESTONE_TEMPLATES[templateIndex]!;
  return {
    id,
    weddingId: readyWedding.id,
    templateKey: template.key,
    title: template.title,
    notes: null,
    schedule: "relative" as const,
    offsetWeeks: template.offsetWeeks,
    fixedDate: null,
    status: "todo" as const,
    isCustom: false,
    completedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function taskRow(id: number, milestoneId: number, title: string, done = false) {
  return {
    id,
    milestoneId,
    title,
    position: 0,
    doneAt: done ? createdAt : null,
    doneByUserId: done ? user.id : null,
    createdAt,
  };
}

interface JourneyBody {
  today: string;
  weddingDate: string | null;
  daysToGo: number | null;
  progress: { done: number; total: number; percent: number };
  currentMilestoneId: number | null;
  nodes: Array<{
    id: number;
    templateKey: string | null;
    title: string;
    dueDate: string | null;
    phase: string;
    status: string;
    state: string;
    isCustom: boolean;
    tasks: Array<{ id: number; title: string; done: boolean }>;
  }>;
  phases: Array<{ key: string; label: string; milestoneIds: number[] }>;
}

const authorizedWeddingRow = [{ wedding: readyWedding }];

describe("journey map milestones", { concurrency: false }, () => {
  test("requires a signed-in user", async () => {
    await withHarness({}, [], async ({ db: dbHarness }) => {
      const response = await apiRequest(`/weddings/${readyWedding.id}/milestones`, {
        userId: null,
      });
      assert.equal(response.status, 401);
      assert.equal(dbHarness.operations.length, 0);
    });
  });

  test("seeds the starter journey the first time the map opens", async () => {
    const seeded = MILESTONE_TEMPLATES.map((_, index) =>
      templateMilestoneRow(100 + index, index),
    );
    const seededTasks = MILESTONE_TEMPLATES.flatMap((template, index) =>
      template.tasks.map((title, position) => ({
        ...taskRow(1000 + index * 10 + position, 100 + index, title),
        position,
      })),
    );

    await withHarness(
      {
        selects: [authorizedWeddingRow, []],
        inserts: [seeded, seededTasks],
      },
      [],
      async ({ db: dbHarness }) => {
        // A "today" far from the server's date is ignored.
        const response = await apiRequest(
          `/weddings/${readyWedding.id}/milestones?today=2001-01-01`,
        );
        assert.equal(response.status, 200);
        const journey = response.body as JourneyBody;

        assert.equal(journey.today, new Date().toISOString().slice(0, 10));
        assert.equal(journey.weddingDate, "2027-06-12");
        assert.equal(journey.nodes.length, MILESTONE_TEMPLATES.length);
        assert.equal(journey.nodes[0]!.templateKey, "set-budget");
        assert.equal(journey.nodes.at(-1)!.templateKey, "day-of-timeline");
        assert.equal(
          journey.nodes.find((node) => node.templateKey === "book-venue")!.dueDate,
          "2026-06-27",
        );
        assert.equal(journey.currentMilestoneId, 100);
        assert.deepEqual(journey.progress, {
          done: 0,
          total: MILESTONE_TEMPLATES.length,
          percent: 0,
        });
        assert.equal(journey.nodes[0]!.tasks.length, 3);

        // Milestones and tasks are written together or not at all.
        const kinds = dbHarness.operations.map((operation) => operation.kind);
        assert.deepEqual(kinds.slice(-3), ["transaction", "insert", "insert"]);
        const inserts = dbHarness.operations.filter(
          (operation) => operation.kind === "insert",
        );
        assert.equal(inserts.length, 2);
        assert.equal(inserts[0]!.table, milestonesTable);
        const milestoneValues = inserts[0]!.values as Array<{
          weddingId: number;
          templateKey: string;
        }>;
        assert.equal(milestoneValues.length, MILESTONE_TEMPLATES.length);
        assert.ok(
          milestoneValues.every((value) => value.weddingId === readyWedding.id),
        );
        assert.equal(inserts[1]!.table, milestoneTasksTable);
      },
    );
  });

  test("reads an existing journey without seeding again", async () => {
    const venue = { ...templateMilestoneRow(101, 2), status: "done" as const };
    const photographer = templateMilestoneRow(102, 3);

    await withHarness(
      {
        selects: [
          authorizedWeddingRow,
          [photographer, venue],
          [taskRow(500, 102, "Compare portfolios", true)],
        ],
      },
      [],
      async ({ db: dbHarness }) => {
        const response = await apiRequest(`/weddings/${readyWedding.id}/milestones`);
        assert.equal(response.status, 200);
        const journey = response.body as JourneyBody;

        assert.deepEqual(
          journey.nodes.map((node) => node.id),
          [101, 102],
        );
        assert.equal(journey.nodes[0]!.state, "done");
        assert.equal(journey.currentMilestoneId, 102);
        assert.deepEqual(journey.nodes[1]!.tasks, [
          { id: 500, title: "Compare portfolios", done: true },
        ]);
        assert.deepEqual(journey.progress, { done: 1, total: 2, percent: 50 });
        assert.ok(
          dbHarness.operations.every((operation) => operation.kind === "select"),
        );
      },
    );
  });

  test("adds a custom milestone pinned to a date", async () => {
    const custom = {
      ...templateMilestoneRow(150, 0),
      templateKey: null,
      title: "Engagement party",
      schedule: "fixed" as const,
      offsetWeeks: null,
      fixedDate: "2027-01-09",
      isCustom: true,
    };

    await withHarness(
      {
        selects: [authorizedWeddingRow, [{ value: 0 }], [custom], []],
        inserts: [[custom], []],
      },
      [],
      async ({ db: dbHarness }) => {
        const response = await apiRequest(`/weddings/${readyWedding.id}/milestones`, {
          method: "POST",
          body: {
            title: "  Engagement party ",
            when: { kind: "date", date: "2027-01-09" },
            tasks: ["Send invites"],
          },
        });
        assert.equal(response.status, 201);
        const body = response.body as { milestoneId: number; journey: JourneyBody };
        assert.equal(body.milestoneId, 150);
        assert.equal(body.journey.nodes[0]!.phase, "three-to-six");
        assert.equal(body.journey.nodes[0]!.isCustom, true);

        const [milestoneInsert, taskInsert] = dbHarness.operations.filter(
          (operation) => operation.kind === "insert",
        );
        assert.deepEqual(milestoneInsert!.values, {
          weddingId: readyWedding.id,
          title: "Engagement party",
          notes: null,
          isCustom: true,
          schedule: "fixed",
          fixedDate: "2027-01-09",
          offsetWeeks: null,
        });
        assert.deepEqual(taskInsert!.values, [
          { milestoneId: 150, title: "Send invites", position: 0 },
        ]);
      },
    );
  });

  test("adds a custom milestone to a phase so it moves with the date", async () => {
    await withHarness(
      {
        selects: [authorizedWeddingRow, [{ value: 2 }], [], []],
        inserts: [[{ ...templateMilestoneRow(151, 0), isCustom: true }]],
      },
      [],
      async ({ db: dbHarness }) => {
        const response = await apiRequest(`/weddings/${readyWedding.id}/milestones`, {
          method: "POST",
          body: { title: "Dance lessons", when: { kind: "phase", phase: "one-to-three" } },
        });
        assert.equal(response.status, 201);
        const insert = dbHarness.operations.find(
          (operation) => operation.kind === "insert",
        );
        assert.equal((insert!.values as { schedule: string }).schedule, "relative");
        assert.equal((insert!.values as { offsetWeeks: number }).offsetWeeks, 8);
      },
    );
  });

  test("rejects impossible dates, unknown fields and the custom milestone cap", async () => {
    await withHarness(
      { selects: [authorizedWeddingRow, authorizedWeddingRow, authorizedWeddingRow, [{ value: 100 }]] },
      [],
      async ({ db: dbHarness }) => {
        const badDate = await apiRequest(`/weddings/${readyWedding.id}/milestones`, {
          method: "POST",
          body: { title: "Cake tasting", when: { kind: "date", date: "2027-02-30" } },
        });
        assert.equal(badDate.status, 400);

        const extraField = await apiRequest(`/weddings/${readyWedding.id}/milestones`, {
          method: "POST",
          body: {
            title: "Cake tasting",
            when: { kind: "phase", phase: "three-to-six" },
            weddingId: 999,
          },
        });
        assert.equal(extraField.status, 400);

        const capped = await apiRequest(`/weddings/${readyWedding.id}/milestones`, {
          method: "POST",
          body: { title: "Cake tasting", when: { kind: "phase", phase: "three-to-six" } },
        });
        assert.equal(capped.status, 409);

        assert.ok(
          dbHarness.operations.every((operation) => operation.kind === "select"),
        );
      },
    );
  });

  test("marks a milestone done and records when", async () => {
    const venue = templateMilestoneRow(101, 2);
    await withHarness(
      {
        selects: [
          authorizedWeddingRow,
          [venue],
          [{ ...venue, status: "done" as const }],
          [],
        ],
      },
      [],
      async ({ db: dbHarness }) => {
        const response = await apiRequest(
          `/weddings/${readyWedding.id}/milestones/101`,
          { method: "PATCH", body: { status: "done" } },
        );
        assert.equal(response.status, 200);
        const update = dbHarness.operations.find(
          (operation) => operation.kind === "update",
        );
        assert.equal(update!.table, milestonesTable);
        const values = update!.values as { status: string; completedAt: unknown };
        assert.equal(values.status, "done");
        assert.ok(values.completedAt instanceof Date);
        const journey = (response.body as { journey: JourneyBody }).journey;
        assert.equal(journey.nodes[0]!.state, "done");
      },
    );
  });

  test("skips starter milestones instead of deleting them", async () => {
    await withHarness(
      { selects: [authorizedWeddingRow, [templateMilestoneRow(101, 2)]] },
      [],
      async ({ db: dbHarness }) => {
        const response = await apiRequest(
          `/weddings/${readyWedding.id}/milestones/101`,
          { method: "DELETE" },
        );
        assert.equal(response.status, 409);
        assert.ok(
          dbHarness.operations.every((operation) => operation.kind === "select"),
        );
      },
    );
  });

  test("checks off a task and records who did it", async () => {
    const venue = templateMilestoneRow(101, 2);
    await withHarness(
      {
        selects: [
          authorizedWeddingRow,
          [venue],
          [taskRow(500, 101, "Tour your favorites")],
          [user],
          [venue],
          [taskRow(500, 101, "Tour your favorites", true)],
        ],
      },
      [],
      async ({ db: dbHarness }) => {
        const response = await apiRequest(
          `/weddings/${readyWedding.id}/milestones/101/tasks/500`,
          { method: "PATCH", body: { done: true } },
        );
        assert.equal(response.status, 200);
        const update = dbHarness.operations.find(
          (operation) => operation.kind === "update",
        );
        assert.equal(update!.table, milestoneTasksTable);
        const values = update!.values as { doneAt: unknown; doneByUserId: number };
        assert.ok(values.doneAt instanceof Date);
        assert.equal(values.doneByUserId, user.id);
      },
    );
  });

  test("hides other couples' weddings, milestones and tasks", async () => {
    await withHarness(
      { selects: [[], authorizedWeddingRow, [], authorizedWeddingRow, [templateMilestoneRow(101, 2)], []] },
      [],
      async ({ db: dbHarness }) => {
        const foreignWedding = await apiRequest("/weddings/999/milestones");
        assert.equal(foreignWedding.status, 404);
        assert.deepEqual(foreignWedding.body, { error: "Wedding not found" });

        const foreignMilestone = await apiRequest(
          `/weddings/${readyWedding.id}/milestones/999`,
          { method: "PATCH", body: { status: "done" } },
        );
        assert.equal(foreignMilestone.status, 404);
        assert.deepEqual(foreignMilestone.body, { error: "Milestone not found" });

        const foreignTask = await apiRequest(
          `/weddings/${readyWedding.id}/milestones/101/tasks/999`,
          { method: "DELETE" },
        );
        assert.equal(foreignTask.status, 404);
        assert.deepEqual(foreignTask.body, { error: "Task not found" });

        assert.ok(
          dbHarness.operations.every((operation) => operation.kind === "select"),
        );
      },
    );
  });

  test("previews a date change without writing anything", async () => {
    await withHarness(
      {
        selects: [authorizedWeddingRow, [templateMilestoneRow(101, 2)], []],
      },
      [],
      async ({ db: dbHarness }) => {
        const response = await apiRequest(
          `/weddings/${readyWedding.id}/milestones/date-preview`,
          { method: "POST", body: { weddingDate: "2027-09-18" } },
        );
        assert.equal(response.status, 200);
        const preview = response.body as {
          moved: Array<{ id: number; from: string; to: string }>;
        };
        assert.deepEqual(preview.moved, [
          { id: 101, title: "Book the venue", from: "2026-06-27", to: "2026-10-03" },
        ]);
        assert.ok(
          dbHarness.operations.every((operation) => operation.kind === "select"),
        );
      },
    );
  });
});

// ── Sharing a wedding and setting the date ────────────────────────────────────

const partnerUser = {
  id: 2,
  clerkId: "clerk-user-b",
  email: "partner@example.com",
  firstName: "Sam",
  createdAt,
};
const ownerMembership = [
  { wedding: readyWedding, memberRole: "owner", userId: user.id },
];
const partnerMembership = [
  { wedding: readyWedding, memberRole: "partner", userId: partnerUser.id },
];
const liveInvite = {
  id: 70,
  weddingId: readyWedding.id,
  codeHash: hashInviteCode("ABCD2345"),
  createdByUserId: user.id,
  expiresAt: new Date(Date.now() + 86_400_000),
  usedAt: null,
  usedByUserId: null,
  createdAt,
};
const ownerRow = {
  id: 1,
  userId: user.id,
  role: "owner",
  firstName: "Ross",
  joinedAt: createdAt,
};
const partnerRow = {
  id: 2,
  userId: partnerUser.id,
  role: "partner",
  firstName: "Sam",
  joinedAt: createdAt,
};

function onlyReads(operations: { kind: string }[]) {
  return operations.every((operation) => operation.kind === "select");
}

describe("sharing a wedding and setting the date", { concurrency: false }, () => {
  test("checks wedding access through membership, not the creator column", async () => {
    await withHarness(
      { selects: [[{ wedding: readyWedding }], [timeline]] },
      [],
      async ({ db: dbHarness }) => {
        const response = await apiRequest(`/timelines/${readyWedding.id}`, {
          userId: partnerUser.clerkId,
        });
        assert.equal(response.status, 200);
        const lookup = dbHarness.operations[0]!;
        assert.equal(lookup.table, weddingsTable);
        assert.deepEqual(lookup.joins, [usersTable, weddingMembersTable]);
      },
    );
  });

  test("onboards a couple who haven't picked a date yet", async () => {
    const undated = { ...generatingWedding, weddingDate: null };
    await withHarness(
      { selects: [[user], [], []], inserts: [[undated], []], updates: [[]] },
      [{ content: JSON.stringify({ weeks: timelineWeeks }) }],
      async ({ db: dbHarness, ai }) => {
        const response = await apiRequest("/timelines/generate", {
          method: "POST",
          body: { city: "Austin, TX", guestCount: 80, style: "standard" },
        });
        assert.equal(response.status, 202);

        const weddingInsert = dbHarness.operations.find(
          (operation) =>
            operation.kind === "insert" && operation.table === weddingsTable,
        );
        assert.equal(
          (weddingInsert?.values as { weddingDate: unknown }).weddingDate,
          null,
        );

        await waitFor(() => ai.calls.length === 1);
        const prompt = JSON.stringify(ai.calls[0]);
        assert.match(prompt, /not picked a date yet/);
        assert.doesNotMatch(prompt, /Wedding: null/);
      },
    );
  });

  test("rejects an impossible wedding date at sign-up", async () => {
    await withHarness({}, [], async ({ db: dbHarness }) => {
      const response = await apiRequest("/timelines/generate", {
        method: "POST",
        body: {
          weddingDate: "2027-02-30",
          city: "Austin, TX",
          guestCount: 80,
          style: "standard",
        },
      });
      assert.equal(response.status, 400);
      assert.equal(dbHarness.operations.length, 0);
    });
  });

  test("lets either partner set, change or clear the date", async () => {
    const moved = { ...readyWedding, weddingDate: "2027-09-18" };
    const cleared = { ...readyWedding, weddingDate: null };
    await withHarness(
      {
        selects: [partnerMembership, ownerMembership],
        updates: [[moved], [cleared]],
      },
      [],
      async ({ db: dbHarness }) => {
        const set = await apiRequest(`/weddings/${readyWedding.id}`, {
          method: "PATCH",
          userId: partnerUser.clerkId,
          body: { weddingDate: "2027-09-18" },
        });
        assert.equal(set.status, 200);
        assert.equal(
          (set.body as { wedding: { weddingDate: string } }).wedding.weddingDate,
          "2027-09-18",
        );

        const clear = await apiRequest(`/weddings/${readyWedding.id}`, {
          method: "PATCH",
          body: { weddingDate: null },
        });
        assert.equal(clear.status, 200);

        const updates = dbHarness.operations.filter(
          (operation) => operation.kind === "update",
        );
        assert.deepEqual(
          updates.map((operation) => [operation.table, operation.values]),
          [
            [weddingsTable, { weddingDate: "2027-09-18" }],
            [weddingsTable, { weddingDate: null }],
          ],
        );
      },
    );
  });

  test("refuses bad date changes and other couples' weddings", async () => {
    await withHarness(
      { selects: [ownerMembership, ownerMembership, []] },
      [],
      async ({ db: dbHarness }) => {
        const impossible = await apiRequest(`/weddings/${readyWedding.id}`, {
          method: "PATCH",
          body: { weddingDate: "2027-13-01" },
        });
        assert.equal(impossible.status, 400);

        const extra = await apiRequest(`/weddings/${readyWedding.id}`, {
          method: "PATCH",
          body: { weddingDate: "2027-09-18", city: "Elsewhere" },
        });
        assert.equal(extra.status, 400);

        const foreign = await apiRequest("/weddings/999", {
          method: "PATCH",
          body: { weddingDate: "2027-09-18" },
        });
        assert.equal(foreign.status, 404);
        assert.deepEqual(foreign.body, { error: "Wedding not found" });
        assert.ok(onlyReads(dbHarness.operations));
      },
    );
  });

  test("lists the couple and says who is who", async () => {
    await withHarness(
      { selects: [partnerMembership, [ownerRow, partnerRow], []] },
      [],
      async () => {
        const response = await apiRequest(`/weddings/${readyWedding.id}/members`, {
          userId: partnerUser.clerkId,
        });
        assert.equal(response.status, 200);
        const body = response.body as {
          members: Array<{ id: number; role: string; firstName: string; isYou: boolean }>;
          canInvite: boolean;
          pendingInvite: unknown;
        };
        assert.deepEqual(
          body.members.map(({ id, role, firstName, isYou }) => ({ id, role, firstName, isYou })),
          [
            { id: 1, role: "owner", firstName: "Ross", isYou: false },
            { id: 2, role: "partner", firstName: "Sam", isYou: true },
          ],
        );
        assert.equal(body.canInvite, false);
        assert.equal(body.pendingInvite, null);
      },
    );
  });

  test("makes a single-use invite code and stores only its hash", async () => {
    await withHarness(
      { selects: [ownerMembership, [ownerRow]] },
      [],
      async ({ db: dbHarness }) => {
        const before = Date.now();
        const response = await apiRequest(`/weddings/${readyWedding.id}/invites`, {
          method: "POST",
        });
        assert.equal(response.status, 201);
        const { code, expiresAt } = response.body as { code: string; expiresAt: string };
        assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);

        const lifetime = new Date(expiresAt).getTime() - before;
        assert.ok(lifetime > 6.9 * 86_400_000 && lifetime < 7.1 * 86_400_000);

        // Earlier unused codes are cleared in the same transaction.
        const kinds = dbHarness.operations.map((operation) => operation.kind);
        assert.deepEqual(kinds.slice(-3), ["transaction", "delete", "insert"]);
        assert.equal(dbHarness.operations.at(-2)?.table, weddingInvitesTable);

        const stored = dbHarness.operations.at(-1)?.values as Record<string, unknown>;
        assert.equal(stored.codeHash, hashInviteCode(code.replace("-", "")));
        assert.ok(!JSON.stringify(stored).includes(code.replace("-", "")));
        assert.equal(stored.createdByUserId, user.id);
      },
    );
  });

  test("won't make a code once both partners have joined", async () => {
    await withHarness(
      { selects: [ownerMembership, [ownerRow, partnerRow]] },
      [],
      async ({ db: dbHarness }) => {
        const response = await apiRequest(`/weddings/${readyWedding.id}/invites`, {
          method: "POST",
        });
        assert.equal(response.status, 409);
        assert.ok(onlyReads(dbHarness.operations));
      },
    );
  });

  test("joins the partner with a code typed loosely", async () => {
    await withHarness(
      {
        selects: [[partnerUser], [liveInvite], [], []],
        updates: [[{ ...liveInvite, usedAt: createdAt }]],
        inserts: [[{ id: 2, weddingId: readyWedding.id, userId: partnerUser.id, role: "partner" }]],
      },
      [],
      async ({ db: dbHarness }) => {
        const response = await apiRequest("/invites/accept", {
          method: "POST",
          userId: partnerUser.clerkId,
          body: { code: " abcd-2345 " },
        });
        assert.equal(response.status, 200);
        assert.deepEqual(response.body, { weddingId: readyWedding.id });

        const claim = dbHarness.operations.find((operation) => operation.kind === "update");
        assert.equal(claim?.table, weddingInvitesTable);
        assert.equal((claim?.values as { usedByUserId: number }).usedByUserId, partnerUser.id);
        const member = dbHarness.operations.find((operation) => operation.kind === "insert");
        assert.equal(member?.table, weddingMembersTable);
        assert.deepEqual(member?.values, {
          weddingId: readyWedding.id,
          userId: partnerUser.id,
          role: "partner",
        });
      },
    );
  });

  test("gives wrong, used and malformed codes the same answer, then slows guessing", async () => {
    const guesser = { ...partnerUser, id: 3, clerkId: "clerk-user-guesser" };
    const selects: unknown[] = [];
    // Two malformed codes (user lookup only), then three well-formed misses.
    selects.push([guesser], [guesser]);
    for (let i = 0; i < 3; i += 1) selects.push([guesser], []);
    selects.push([guesser]);

    await withHarness({ selects }, [], async ({ db: dbHarness }) => {
      const answers = [];
      for (const code of ["hello", "ABCD-234O", "ABCD-2346", "ZZZZ-ZZZZ", "QQQQ-2222"]) {
        answers.push(
          await apiRequest("/invites/accept", {
            method: "POST",
            userId: guesser.clerkId,
            body: { code },
          }),
        );
      }
      for (const answer of answers) {
        assert.equal(answer.status, 404);
        assert.deepEqual(answer.body, answers[0]!.body);
      }

      const blocked = await apiRequest("/invites/accept", {
        method: "POST",
        userId: guesser.clerkId,
        body: { code: "ABCD-2345" },
      });
      assert.equal(blocked.status, 429);
      assert.ok(onlyReads(dbHarness.operations));
    });
  });

  test("won't move someone who is already planning another wedding", async () => {
    const theirOwn = { ...readyWedding, id: 11 };
    await withHarness(
      { selects: [[partnerUser], [liveInvite], [{ wedding: theirOwn }]] },
      [],
      async ({ db: dbHarness }) => {
        const response = await apiRequest("/invites/accept", {
          method: "POST",
          userId: partnerUser.clerkId,
          body: { code: "ABCD-2345" },
        });
        assert.equal(response.status, 409);
        assert.equal((response.body as { code: string }).code, "ALREADY_PLANNING");
        assert.ok(onlyReads(dbHarness.operations));
      },
    );
  });

  test("refuses a third person even with a live code", async () => {
    await withHarness(
      {
        selects: [[partnerUser], [liveInvite], [], []],
        updates: [[{ ...liveInvite, usedAt: createdAt }]],
        inserts: [[]],
      },
      [],
      async () => {
        const response = await apiRequest("/invites/accept", {
          method: "POST",
          userId: partnerUser.clerkId,
          body: { code: "ABCD-2345" },
        });
        assert.equal(response.status, 409);
        assert.equal((response.body as { code: string }).code, "PARTNER_ALREADY_JOINED");
      },
    );
  });

  test("only the partner who started the plan can delete it", async () => {
    await withHarness({ selects: [partnerMembership] }, [], async ({ db: dbHarness }) => {
      const response = await apiRequest(`/timelines/${readyWedding.id}`, {
        method: "DELETE",
        userId: partnerUser.clerkId,
      });
      assert.equal(response.status, 403);
      assert.ok(onlyReads(dbHarness.operations));
    });
  });

  test("the partner can leave, and the owner can remove them but not themselves", async () => {
    const partnerMember = { id: 2, weddingId: readyWedding.id, userId: partnerUser.id, role: "partner" };
    const ownerMember = { id: 1, weddingId: readyWedding.id, userId: user.id, role: "owner" };
    await withHarness(
      {
        selects: [
          partnerMembership, [partnerMember],
          ownerMembership, [partnerMember],
          ownerMembership, [ownerMember],
          partnerMembership, [ownerMember],
        ],
      },
      [],
      async ({ db: dbHarness }) => {
        const leave = await apiRequest(`/weddings/${readyWedding.id}/members/2`, {
          method: "DELETE",
          userId: partnerUser.clerkId,
        });
        assert.equal(leave.status, 200);

        const remove = await apiRequest(`/weddings/${readyWedding.id}/members/2`, {
          method: "DELETE",
        });
        assert.equal(remove.status, 200);

        const ownerLeaves = await apiRequest(`/weddings/${readyWedding.id}/members/1`, {
          method: "DELETE",
        });
        assert.equal(ownerLeaves.status, 409);

        const partnerRemovesOwner = await apiRequest(`/weddings/${readyWedding.id}/members/1`, {
          method: "DELETE",
          userId: partnerUser.clerkId,
        });
        assert.equal(partnerRemovesOwner.status, 404);

        const deletes = dbHarness.operations.filter((operation) => operation.kind === "delete");
        assert.equal(deletes.length, 2);
        assert.ok(deletes.every((operation) => operation.table === weddingMembersTable));
      },
    );
  });

  test("the creator keeps owner access even without an owner membership row", async () => {
    await withHarness(
      {
        selects: [[{ wedding: readyWedding, memberRole: null, userId: user.id }]],
        deletes: [[], []],
      },
      [],
      async ({ db: dbHarness }) => {
        const response = await apiRequest(`/timelines/${readyWedding.id}`, {
          method: "DELETE",
        });
        assert.equal(response.status, 200);
        const deleted = dbHarness.operations
          .filter((operation) => operation.kind === "delete")
          .map((operation) => operation.table);
        assert.deepEqual(deleted, [timelinesTable, weddingsTable]);
      },
    );
  });

  test("a code accepted while another request gave them a plan is refused", async () => {
    const raced = { ...readyWedding, id: 12 };
    await withHarness(
      { selects: [[partnerUser], [liveInvite], [], [{ wedding: raced }]] },
      [],
      async ({ db: dbHarness }) => {
        const response = await apiRequest("/invites/accept", {
          method: "POST",
          userId: partnerUser.clerkId,
          body: { code: "ABCD-2345" },
        });
        assert.equal(response.status, 409);
        assert.equal((response.body as { code: string }).code, "ALREADY_PLANNING");
        const kinds = dbHarness.operations.map((operation) => operation.kind);
        assert.ok(kinds.includes("execute"), "takes the per-user lock");
        assert.ok(!kinds.includes("update") && !kinds.includes("insert"));
      },
    );
  });

  test("a second sign-up racing the first gets the plan that won", async () => {
    await withHarness(
      { selects: [[user], [], [{ wedding: generatingWedding }]] },
      [],
      async ({ db: dbHarness, ai }) => {
        const response = await apiRequest("/timelines/generate", {
          method: "POST",
          body: { city: "Austin, TX", guestCount: 80, style: "standard" },
        });
        assert.equal(response.status, 202);
        assert.deepEqual(response.body, {
          weddingId: generatingWedding.id,
          status: "generating",
        });
        assert.ok(!dbHarness.operations.some((operation) => operation.kind === "insert"));
        assert.equal(ai.calls.length, 0);
      },
    );
  });

  test("keeps the first name current so the partner sees who joined", async () => {
    await withHarness(
      { selects: [[{ ...user, firstName: null }]], updates: [[{ ...user, firstName: "Ross" }]] },
      [],
      async ({ db: dbHarness }) => {
        const response = await apiRequest("/users/me", {
          method: "POST",
          body: { firstName: "Ross" },
        });
        assert.equal(response.status, 200);
        const update = dbHarness.operations.find((operation) => operation.kind === "update");
        assert.deepEqual(update?.values, { firstName: "Ross" });
      },
    );
  });
});
