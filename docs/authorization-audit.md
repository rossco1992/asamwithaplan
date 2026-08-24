# Wedding resource authorization audit

This audit covers every API endpoint currently exposed by the service. The
authorization model is owner-only: an authenticated Clerk user may access a
wedding-scoped resource only when the wedding belongs to that user's internal
user record.

## Access-control rules

- `requireAuth` verifies the Clerk session before any protected handler runs.
- `getAuthorizedWedding` resolves a wedding and its owner in one query.
- `getAuthorizedQuote` resolves a quote through its wedding and owner in one
  query.
- `requireResourceAccess` validates the supplied resource ID, performs the
  owner-scoped lookup, and attaches only an authorized resource to the request.
- A missing resource and another user's resource both return the same `404`
  response. This prevents callers from discovering whether a numeric ID exists.
- Resource lookup errors fail closed and are passed to the server error path;
  handlers never run without an authorized resource.

These helpers are also the extension point for future collaborator access. A
membership policy can be added to the shared lookup without duplicating or
weakening checks across route handlers.

## Endpoint inventory

| Endpoint                               | Resource boundary                   | Enforcement                                                                                          | Result           |
| -------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------- |
| `GET /api/healthz`                     | None; public health signal          | No user or resource data returned                                                                    | Public by design |
| `POST /api/users/me`                   | Current user                        | Clerk ID comes only from the verified session; body IDs are ignored                                  | Session scoped   |
| `GET /api/users/me`                    | Current user                        | Clerk ID comes only from the verified session                                                        | Session scoped   |
| `POST /api/timelines/generate`         | Current user's wedding              | Internal user and existing wedding are resolved from the verified Clerk ID                           | Owner scoped     |
| `GET /api/timelines/current`           | Current user's wedding and timeline | Wedding is selected by the session-derived internal user ID                                          | Owner scoped     |
| `POST /api/timelines/:weddingId/retry` | Wedding and generated timeline      | Shared wedding guard checks the path ID and owner before mutation                                    | Owner scoped     |
| `DELETE /api/timelines/:weddingId`     | Wedding and generated timeline      | Shared wedding guard checks the path ID and owner before deletion                                    | Owner scoped     |
| `GET /api/timelines/:weddingId`        | Wedding and generated timeline      | Shared wedding guard checks the path ID and owner before returning state                             | Owner scoped     |
| `POST /api/quotes`                     | Wedding and new quote               | Shared wedding guard checks the form/JSON wedding ID before PDF extraction, AI parsing, or insertion | Owner scoped     |
| `GET /api/quotes?weddingId=:id`        | Wedding and its quotes              | Shared wedding guard checks the query ID and owner before listing                                    | Owner scoped     |
| `PATCH /api/quotes/:id/select`         | Quote and its wedding               | Shared quote guard joins quote, wedding, and owner before mutation                                   | Owner scoped     |
| `DELETE /api/quotes/:id`               | Quote and its wedding               | Shared quote guard joins quote, wedding, and owner before deletion                                   | Owner scoped     |

## Conversation resources

There are no conversation or message routes registered by the API. The
placeholder database schemas also have no user or wedding ownership column and
are not exported from the active database schema index. They must not be
exposed through an API until a migration establishes a wedding or user
relationship and every route applies the matching shared authorization guard.

## Negative coverage

`resourceAccess.test.mjs` exercises representative `GET`, `POST`, `PATCH`, and
`DELETE` requests. For each method, an authenticated user supplies a resource
ID they do not own and receives exactly the same `404` status and body as a
missing ID. The suite also verifies that owned resources proceed and that a
route wired without `requireAuth` fails closed with `401`.
