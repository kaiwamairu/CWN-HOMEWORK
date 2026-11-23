# B04 · Uploads and required documents

## B05 payment

Import `assertRequiredDraftDocuments(db, draftId)` from `web/src/server/domain/uploads.ts`. For QR creation, check ownership and unpaid status, then call it inside the same immediate transaction as `lockDraftFee()` and the payment ref insert. For payment callbacks, return the existing idempotent outcome for an already accepted payment. Before first acceptance, call the same helper inside the transaction before allocating case and receipt IDs, moving the files or changing paid state. Required files can be deleted from a pending draft. The helper throws HTTP 409 `MISSING_DOCS` with ordered Thai names in `missing` and the exact Thai message. [CONTRACT §5–6.2](../CONTRACT.md) · [ADI-02](../specs/001-municipal-eservice/contracts/interface-map.md)

## B06 wizard

Pass the serializable slot definitions `UPLOAD_SLOTS[serviceId]` from the server page to the client wizard. Import `UploadSlots` from `web/src/components/uploads/UploadSlots.tsx` and pass `draftId`, `slots`, `files`, `onFilesChange` and `onContinue`. Use the metadata from B03 draft detail to initialize the wizard's `files` state. `onFilesChange` receives the updated array. Mount with `key={draftId}` in the attachment step. The panel manages upload and removal, focuses the first attachment control, and renders `missing-docs` and `to-payment-btn`. Call `onContinue` to advance to payment. The optional `disabled` prop locks controls during a parent operation. For case resubmission, the domain also exports `validateUpload(bytes, 'extra', bugs?)`, which returns the MIME from the bytes and enforces the shared per-file limit. [CONTRACT §2.5](../CONTRACT.md)

## B14 routing

In `dispatch()`, after the shared route and session checks, await `handleUploads(request, ctx, actor)` from `web/src/server/http/features/uploads.ts` and return its response when present. The route registry already declares both paths. Let the shared error handler serialize thrown `HttpError` values.

| Method and path | Result |
| --- | --- |
| `POST /api/drafts/:id/files` | Multipart `file` and `docKey`. Returns 201 `{fileId,name,docKey,size}`. |
| `DELETE /api/drafts/:id/files/:fileId` | Returns 204 after deleting the SQLite row containing both metadata and bytes. |

Both accept the owning citizen’s `DRAFT` and `PENDING_PAYMENT` records. Anonymous, wrong-role, foreign or missing, and paid requests receive 401, 403, 404, and 409 respectively. The custom HTTP server already has an 8 MiB transport limit and sends API requests directly to the dispatcher. Keep that path so a 5,242,881-byte multipart upload reaches the feature and returns 400 `FILE_TOO_LARGE`. Files have no static URL. The existing authorized `GET /api/files/:fileId` uses the persisted MIME and bytes. [CONTRACT §0.10 and §6.2](../CONTRACT.md)

## Verification

All seven upload tests passed using Node 24.22.3 and the better-sqlite3 13.2.0 native binding. Run them from `web/` with `node --import tsx --test tests/unit/uploads.test.ts`. The four B04 TypeScript files passed strict checks with TypeScript 5.9.3. A loopback smoke test on the custom HTTP server with the dispatcher wired in memory verified maximum-size upload, 400 `FILE_TOO_LARGE` for 5,242,881-byte and 6 MiB files, owner-only download with the detected MIME, and removal. B05, B06, and B14 own the payment, wizard, and router integration exercised by canonical Playwright. [Upload tests](../web/tests/unit/uploads.test.ts)
