# B03 · Fees and saved drafts

`calculateFee(service, input, bugs?)` in `web/src/server/domain/fees.ts` accepts a service rate row `{id, fee, fee_base, fee_per_sqm}` and returns `{fee, qty, areaSqm}`. Fee amounts are integer baht. Use the current `services` row for the wizard preview. JSON inputs are numbers. SV-01 defaults to one copy when `qty` is omitted on creation. The B01 test flag changes only the SV-03 quote at 101 m² from ฿1,010 to ฿1,000 at the seed rates. [REQUIREMENTS](../REQUIREMENTS.md) · [BUGS](../BUGS.md)

## B14 routing

Call and await `handleDrafts(request, ctx, actor)` from `web/src/server/http/features/drafts.ts` after the shared route, session and role checks. Return its response when present and let the existing `dispatch()` error handler serialize thrown `HttpError`s. The existing route registry already declares its methods. The feature returns `null` for upload, payment and unrelated paths. [CONTRACT §6.2](../CONTRACT.md) · [ADI-01 and ADI-03](../specs/001-municipal-eservice/contracts/interface-map.md)

| Method and path | Response |
| --- | --- |
| `POST /api/drafts` | `201 {draftId, fee}` from `{serviceId, qty?, areaSqm?}` |
| `GET /api/drafts` | `200 {items}` with `{draftId, serviceId, status, fee}` for the citizen’s `DRAFT` and `PENDING_PAYMENT` records |
| `GET /api/drafts/:id` | `200` with the four summary fields, the relevant `qty` or `areaSqm`, and `files: [{fileId, name, docKey, size}]` |
| `PATCH /api/drafts/:id` | `200` with the same detail shape, using the updated input and fee |
| `DELETE /api/drafts/:id` | `204` with an empty body for an unpaid draft |

The domain exports `createDraft`, `listDrafts`, `getDraft`, `updateDraft` and `deleteDraft` with `(db, actor, ...)`. The citizen wizard can use `getDraft(db, actor, draftId, config.bugModes)` on the server, check `serviceId` against the route and use the stored input and attachment metadata. `GET` detail exposes a paid record’s `PAID` status to its owner, so use the status when deciding whether to show resume controls. `PATCH` preserves omitted inputs and accepts edits only in `DRAFT`. Foreign and missing IDs both produce `404 NOT_FOUND`. Wrong roles receive `403` and anonymous callers receive `401`. Creation uses the seed’s yearless draft counter and returns a `DR-` ID. [Source acceptance criteria](../TEST-PLAN.md)

## B04 uploads and B05 payment

`DRAFT` reads quote the current rates. In the same immediate transaction that inserts the QR ref, validate ownership and required documents, then call `lockDraftFee(db, actor, draftId, config.bugModes)` and use the returned amount. It reprices `DRAFT` with the current rates and writes `PENDING_PAYMENT` with `fee` and `locked_fee` set. QR regeneration returns `locked_fee` even after an admin fee change. Throwing during QR creation rolls back the lock. The payment flow owns generation of `EG-` and `RC-` numbers. For pending draft resume, supply the latest QR through the payment feature. [DECISIONS §18](../DECISIONS.md)

Unpaid draft deletion removes all its payment refs and attachments in one immediate transaction. Payment lookup and callbacks will find no matching ref after deletion. `PATCH` and `DELETE` return `409 INVALID_STATE` on an owned paid draft. [REQUIREMENTS A-62](../REQUIREMENTS.md)

## Verification

All 10 focused tests passed with Node 24.22.3 and better-sqlite3 13.2.0. The four B03 TypeScript files passed TypeScript 5.9.3 with strict checks. With the pinned dependencies installed under `web/`, run `node --import tsx --test tests/unit/fees.test.ts`. The tests use the production schema and seed in SQLite memory. The shared router and canonical Playwright run belong to B14. [Focused tests](../web/tests/unit/fees.test.ts)
