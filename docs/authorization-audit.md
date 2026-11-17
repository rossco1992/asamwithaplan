# Wedding resource authorization audit

This audit covers every API endpoint currently exposed by the service. The
authorization model is membership-based: an authenticated Clerk user may access
a wedding-scoped resource only when their internal user record is a member of
that wedding in `wedding_members`. A wedding has at most two members, the
`owner` who created it and one `partner` who joined with an invite code, and
both have the same access except where the table below says otherwise.

## Access-control rules

- `requireAuth` verifies the Clerk session before any protected handler runs.
- `getWeddingMembership` / `getAuthorizedWedding` resolve a wedding and the
  caller's membership in one query.
- `getAuthorizedQuote` resolves a quote through its wedding and the caller's
  membership in one query.
- `getCurrentWeddingForUser` finds the wedding a user started or joined.
- `requireResourceAccess` validates the supplied resource ID, performs the
  member-scoped lookup, and attaches only an authorized resource to the request.
- A missing resource and another user's resource both return the same `404`
  response. This prevents callers from discovering whether a numeric ID exists.
- Resource lookup errors fail closed and are passed to the server error path;
  handlers never run without an authorized resource.

Invite codes are 8 characters from a 32-letter alphabet, single use, valid for
7 days, and stored only as a SHA-256 hash. Creating a new code deletes any
unused one. Wrong, used, expired and malformed codes get the same `404`, and a
user who enters 5 wrong codes in 15 minutes is paused (in-memory per server
instance, a backstop to the code's size). The unique `(wedding_id, role)` index
means a wedding can never hold a second partner, even under a race.

## Endpoint inventory

| Endpoint                               | Resource boundary                   | Enforcement                                                                                          | Result           |
| -------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------- |
| `GET /api/healthz`                     | None; public health signal          | No user or resource data returned                                                                    | Public by design |
| `POST /api/users/me`                   | Current user                        | Clerk ID comes only from the verified session; body IDs are ignored                                  | Session scoped   |
| `GET /api/users/me`                    | Current user                        | Clerk ID comes only from the verified session                                                        | Session scoped   |
| `POST /api/timelines/generate`         | Current user's wedding              | Internal user and any wedding they belong to are resolved from the verified Clerk ID; the creator becomes `owner` in the same transaction | Session scoped |
| `GET /api/timelines/current`           | Current user's wedding and timeline | Wedding is selected through the session-derived user's membership                                   | Member scoped    |
| `POST /api/timelines/:weddingId/retry` | Wedding and generated timeline      | Shared wedding guard checks the path ID and membership before mutation                               | Member scoped    |
| `DELETE /api/timelines/:weddingId`     | Wedding and everything in it        | Shared membership guard, then `403` unless the caller is the `owner`                                 | Owner only       |
| `GET /api/timelines/:weddingId`        | Wedding and generated timeline      | Shared wedding guard checks the path ID and membership before returning state                        | Member scoped    |
| `PATCH /api/weddings/:weddingId`       | Wedding date                        | Shared membership guard; strict body takes only `weddingDate` (a real date or null)                  | Member scoped    |
| `GET /api/weddings/:weddingId/members` | The couple and any pending invite   | Shared membership guard; returns first names and roles only, never emails or codes                   | Member scoped    |
| `POST /api/weddings/:weddingId/invites` | New invite code                    | Shared membership guard; `409` once two members exist; code returned once and stored only as a hash  | Member scoped    |
| `DELETE /api/weddings/:weddingId/invites` | Unused invite codes              | Shared membership guard before deletion                                                              | Member scoped    |
| `DELETE /api/weddings/:weddingId/members/:memberId` | A membership          | Shared membership guard; the owner may remove the partner, the partner may remove themselves, the owner row can't be removed; others get `404` | Member scoped |
| `POST /api/invites/accept`             | Joining a wedding                   | Verified session plus a live, unused code; one plan per user; single-use claim and partner insert in one transaction | Code holder      |
| `/api/weddings/:weddingId/milestones*` | Journey milestones and tasks        | Shared wedding guard checks the path ID and membership before every read or change                   | Member scoped    |
| `POST /api/quotes`                     | Wedding and new quote               | Shared wedding guard checks the form/JSON wedding ID before PDF extraction, AI parsing, or insertion | Member scoped    |
| `GET /api/quotes?weddingId=:id`        | Wedding and its quotes              | Shared wedding guard checks the query ID and membership before listing                               | Member scoped    |
| `PATCH /api/quotes/:id/select`         | Quote and its wedding               | Shared quote guard joins quote, wedding, and membership before mutation                              | Member scoped    |
| `DELETE /api/quotes/:id`               | Quote and its wedding               | Shared quote guard joins quote, wedding, and membership before deletion                              | Member scoped    |

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
