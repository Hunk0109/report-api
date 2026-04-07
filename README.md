# Report API

A **production-oriented** HTTP service for managing **reports** with nested entries, computed metrics, **JWT-based authentication**, **role-based access control**, **optimistic concurrency** (`ETag` / `If-Match`), **idempotent creates**, **signed attachment downloads**, structured logging, request correlation, rate limiting, and an **in-memory asynchronous job queue** with retries and a dead-letter path.

The implementation follows **hexagonal (clean) architecture**: domain logic is isolated from Express and persistence adapters, with explicit ports for repositories, file storage, queues, and logging.

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Node.js** | 18+ (current LTS recommended) |
| **npm** | Comes with Node |

---

## Quick start

### 1. Install dependencies

```bash
cd report-api
npm install
```

### 2. Environment

Copy `.env` or create `.env.local` for overrides. The server creates `uploads/` and `logs/` on startup; you may pre-create them:

```bash
mkdir -p uploads logs
```

**Rotate secrets before any shared or production deployment:** `JWT_SECRET`, `SIGNED_URL_SECRET`.

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP listen port (default `3000`) |
| `NODE_ENV` | `development` \| `test` \| `production` |
| `JWT_SECRET` | Symmetric key for signing JWT access tokens |
| `JWT_EXPIRES_IN` | Access token lifetime (e.g. `24h`) |
| `SIGNED_URL_SECRET` | HMAC secret for signed download URLs (often same class of secret as JWT; keep distinct in production) |
| `SIGNED_URL_EXPIRY` | Signed URL validity in **seconds** |
| `UPLOAD_DIR` | Directory for stored uploads |
| `UPLOAD_MAX_SIZE` | Max upload size in bytes |
| `ALLOWED_FILE_TYPES` | Comma-separated MIME allow list |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window per key |
| `ENFORCE_HTTPS` | `true` forces HTTPS semantics behind a proxy (see [Transport security](#transport-security-https) and `design.md`) |
| `QUEUE_FAILURE_RATE` | `0`–`1` simulated failure rate for demo queue behavior |

### 3. Run

**Development (watch):**

```bash
npm run dev
```

**Production-style (compile + run):**

```bash
npm run build
npm start
```

### 4. Test

```bash
npm test
```

Test environment is initialized in `tests/setupEnv.ts` (isolated upload directory, safe secrets). As of the last verification run:

- **Test Suites:** 6 passed  
- **Tests:** 11 passed  

Run `npm test` locally for the authoritative current counts.

---

## Authentication

All **`/api/reports/*`** routes require a **Bearer JWT**. Obtain a token by posting a **selector** for one of three hard-coded users (`src/shared/auth/users.ts`).

| Request `userId` | Role | Typical use |
|------------------|------|-------------|
| `user-reader` | `reader` | Read-only (`GET` on reports) |
| `user-editor` | `editor` | Create, update **draft** reports, upload attachments |
| `user-admin` | `admin` | Same as editor, plus updates to **published** reports when paired with **justification** (see [Custom business rule](#custom-business-rule-published-reports)) |

**Example — editor token:**

```bash
curl -s -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-editor"}'
```

**Example — admin token:**

```bash
curl -s -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-admin"}'
```

**Example — reader token:**

```bash
curl -s -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-reader"}'
```

Use the returned `accessToken` as:

```http
Authorization: Bearer <accessToken>
```

Tokens are **stateless** (no server-side session), which supports horizontal scaling when all instances share the same signing secret and clock skew is bounded.

---

## API overview

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| `POST` | `/auth/token` | Public | Issue JWT for `user-reader` \| `user-editor` \| `user-admin` |
| `POST` | `/api/reports` | JWT | Create report (`201`, `Location`); optional `Idempotency-Key` |
| `GET` | `/api/reports/:id` | JWT | Get report; `view`, `include`, pagination, filter, sort; `ETag` |
| `PUT` | `/api/reports/:id` | JWT | Partial update; **`If-Match`** required (optimistic locking) |
| `POST` | `/api/reports/:id/attachment` | JWT | Multipart upload (`file` field) |
| `GET` | `/attachments/:fileId/download` | Public | Stream file when `expiry` + `signature` are valid |

---

## cURL examples (copy-paste)

Replace `EDITOR_TOKEN`, `ADMIN_TOKEN`, `READER_TOKEN`, and `REPORT_ID` with values from your environment.

### 1. Create report — `201 Created`

Optional header: `Idempotency-Key` (replays stored response within TTL).

```bash
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST http://localhost:3000/api/reports \
  -H "Authorization: Bearer EDITOR_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: my-unique-key-001" \
  -d '{
    "title": "Q2 Operations",
    "description": "Quarterly summary",
    "priority": "high",
    "tags": ["ops"],
    "metadata": { "department": "Platform", "region": "us-east" }
  }'
```

Expect **`201`**, `Location: /api/reports/<uuid>`, and JSON body including `metadata.version` (used for `If-Match`).

### 2. Get report — rich view with entries + metrics — `200 OK`

```bash
curl -s -w "\nHTTP_STATUS:%{http_code}\n" \
  "http://localhost:3000/api/reports/REPORT_ID?view=rich&include=entries,metrics&page=1&size=10&sortBy=createdAt&sortOrder=desc" \
  -H "Authorization: Bearer EDITOR_TOKEN"
```

Response includes **`ETag`** (current `metadata.version`) and computed **`metrics`**.

### 3. Get report — compact view — `200 OK`

```bash
curl -s -w "\nHTTP_STATUS:%{http_code}\n" \
  "http://localhost:3000/api/reports/REPORT_ID?view=compact" \
  -H "Authorization: Bearer EDITOR_TOKEN"
```

### 4. Update report (draft) — `200 OK` — requires `If-Match`

Send the **current** version from `ETag` or last JSON `metadata.version`:

```bash
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X PUT http://localhost:3000/api/reports/REPORT_ID \
  -H "Authorization: Bearer EDITOR_TOKEN" \
  -H "Content-Type: application/json" \
  -H 'If-Match: "1"' \
  -d '{"description":"Updated copy","title":"Q2 Operations (rev A)"}'
```

Quoted form (`"1"`) matches the parser used in manual testing.

### 5. Publish report — admin + justification — `200 OK`

When `status` is already **`published`**, **admin** must supply **`justification`** (minimum length enforced by validation). Publishing from draft is done by admin with `status` + `justification`:

```bash
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X PUT http://localhost:3000/api/reports/REPORT_ID \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -H 'If-Match: "2"' \
  -d '{"status":"published","justification":"Approved for release per change control"}'
```

### 6. Reader cannot mutate — `403 Forbidden`

```bash
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST http://localhost:3000/api/reports \
  -H "Authorization: Bearer READER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Not allowed","description":"x"}'
```

### 7. Upload attachment — `201 Created`

```bash
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST http://localhost:3000/api/reports/REPORT_ID/attachment \
  -H "Authorization: Bearer EDITOR_TOKEN" \
  -F "file=@./README.md;type=text/plain"
```

Response includes **`signedUrl`** (path + query: `expiry`, `signature`).

### 8. Download via signed URL — `200 OK` (stream) / `401` invalid or expired

No JWT. Use the **`signedUrl`** from the upload response (or build the same host + path):

```bash
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -O -J \
  "http://localhost:3000/attachments/FILE_ID/download?expiry=EXPIRY_UNIX&signature=SIG"
```

---

## Custom business rule: published reports

When a report’s **`status`** is **`published`**:

1. **Editors and readers cannot change it** via `PUT` — the API responds **`403 Forbidden`** (controller guard + domain rule).
2. **Administrators** may update it, but must include a **`justification`** string meeting minimum length (**≥ 5 characters**). Otherwise the API responds **`422`** with a field-level error on `justification`.

Implementation references:

- `src/modules/reports/interfaces/reportController.ts` — early rejection for wrong role / missing justification.
- `src/modules/reports/application/updateReport.useCase.ts` — domain-level enforcement.

Automated coverage: `src/modules/reports/__tests__/updateReport.test.ts`, plus `concurrency.test.ts` and `idempotency.test.ts` for related HTTP semantics.

---

## ✅ Custom Business Rule in Action

The following is **real terminal output** from an end-to-end run: an **editor** attempts to `PUT` a **published** report with a valid `If-Match` but receives **`403 Forbidden`**, proving the rule is enforced in production-like usage.

```json
{"error":"FORBIDDEN","message":"Only administrators may update published reports","statusCode":403,"timestamp":"2026-04-07T21:06:15.979Z","requestId":"5da1aa95-3385-47eb-b36b-3797763b6ae5","field":"status"}
```

That response corresponds to the **`curl`** invocation shown in [Complete API workflow validation](#complete-api-workflow-validation) (editor `PUT` after admin publish).

---

## Complete API workflow validation

The session below is the **same capture** as before: token issuance, create with idempotency key, rich and compact reads, draft update, admin publish with justification, **editor blocked with 403**, attachment upload, and signed download. **Response bodies are unchanged** (including trailing shell `%` where zsh printed no newline after JSON). Only the **commands** are reflowed: the prompt stays on the first line of each interaction, and `curl` flags continue on following lines with `\` so the invocations are easy to read and copy.

```text
hunk01@Harshs-MacBook-Pro report-api % curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-editor"}'
{"accessToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwiZW1haWwiOiJlZGl0b3JAZXhhbXBsZS5jb20iLCJyb2xlIjoiZWRpdG9yIiwiaWF0IjoxNzc1NTk1NjQ4LCJleHAiOjE3NzU2ODIwNDh9.zN1bncDanxz6AlHuGJHswmWSRTyTfadMxQhJBakFsiM","expiresIn":"24h","tokenType":"Bearer"}%

hunk01@Harshs-MacBook-Pro report-api % curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-admin"}'
{"accessToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzIiwiZW1haWwiOiJhZG1pbkBleGFtcGxlLmNvbSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3NTU5NTY1NiwiZXhwIjoxNzc1NjgyMDU2fQ.4d0AnYDy5NCI2LJpVq872lOVHOtdnZcvds1j_a7TxhU","expiresIn":"24h","tokenType":"Bearer"}%

hunk01@Harshs-MacBook-Pro report-api % curl -X POST http://localhost:3000/api/reports \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwiZW1haWwiOiJlZGl0b3JAZXhhbXBsZS5jb20iLCJyb2xlIjoiZWRpdG9yIiwiaWF0IjoxNzc1NTk1NjQ4LCJleHAiOjE3NzU2ODIwNDh9.zN1bncDanxz6AlHuGJHswmWSRTyTfadMxQhJBakFsiM" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: final-test-001" \
  -d '{
"title": "Final Workflow Report",
"description": "Testing all endpoints",
"priority": "high"
}'
{"entries":[],"metrics":{"totalEntries":0,"avgEntryPriority":0,"highPriorityCount":0,"trendIndicator":"normal","lastActivityAt":"2026-04-07T21:02:46.057Z"},"id":"787e21d0-9b94-4415-adcd-df899f4fae4a","title":"Final Workflow Report","description":"Testing all endpoints","status":"draft","priority":"high","ownerId":"2","tags":[],"createdAt":"2026-04-07T21:02:46.057Z","updatedAt":"2026-04-07T21:02:46.057Z","metadata":{"version":1,"viewCount":0,"attachments":[],"extra":{}},"idempotent":false}%

hunk01@Harshs-MacBook-Pro report-api % curl "http://localhost:3000/api/reports/787e21d0-9b94-4415-adcd-df899f4fae4a?view=rich&include=entries,metrics&page=1&size=5" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwiZW1haWwiOiJlZGl0b3JAZXhhbXBsZS5jb20iLCJyb2xlIjoiZWRpdG9yIiwiaWF0IjoxNzc1NTk1NjQ4LCJleHAiOjE3NzU2ODIwNDh9.zN1bncDanxz6AlHuGJHswmWSRTyTfadMxQhJBakFsiM"
{"entries":[],"metrics":{"totalEntries":0,"avgEntryPriority":0,"highPriorityCount":0,"trendIndicator":"normal","lastActivityAt":"2026-04-07T21:02:46.057Z"},"id":"787e21d0-9b94-4415-adcd-df899f4fae4a","title":"Final Workflow Report","description":"Testing all endpoints","status":"draft","priority":"high","ownerId":"2","tags":[],"createdAt":"2026-04-07T21:02:46.057Z","updatedAt":"2026-04-07T21:02:46.057Z","metadata":{"version":1,"viewCount":1,"attachments":[],"extra":{}}}%

hunk01@Harshs-MacBook-Pro report-api % curl "http://localhost:3000/api/reports/787e21d0-9b94-4415-adcd-df899f4fae4a?view=compact" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwiZW1haWwiOiJlZGl0b3JAZXhhbXBsZS5jb20iLCJyb2xlIjoiZWRpdG9yIiwiaWF0IjoxNzc1NTk1NjQ4LCJleHAiOjE3NzU2ODIwNDh9.zN1bncDanxz6AlHuGJHswmWSRTyTfadMxQhJBakFsiM"
{"id":"787e21d0-9b94-4415-adcd-df899f4fae4a","title":"Final Workflow Report","description":"Testing all endpoints","status":"draft","priority":"high","ownerId":"2","tags":[],"createdAt":"2026-04-07T21:02:46.057Z","updatedAt":"2026-04-07T21:02:46.057Z","metadata":{"version":1,"viewCount":2,"attachments":[],"extra":{}},"metrics":{"totalEntries":0,"avgEntryPriority":0,"highPriorityCount":0,"trendIndicator":"normal","lastActivityAt":"2026-04-07T21:02:46.057Z"}}%

hunk01@Harshs-MacBook-Pro report-api % curl -X PUT http://localhost:3000/api/reports/787e21d0-9b94-4415-adcd-df899f4fae4a \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwiZW1haWwiOiJlZGl0b3JAZXhhbXBsZS5jb20iLCJyb2xlIjoiZWRpdG9yIiwiaWF0IjoxNzc1NTk1NjQ4LCJleHAiOjE3NzU2ODIwNDh9.zN1bncDanxz6AlHuGJHswmWSRTyTfadMxQhJBakFsiM" \
  -H "Content-Type: application/json" \
  -H "If-Match: "1"" \
  -d '{
"title": "Updated by Editor",
"description": "Still in draft mode"
}'
{"entries":[],"metrics":{"totalEntries":0,"avgEntryPriority":0,"highPriorityCount":0,"trendIndicator":"normal","lastActivityAt":"2026-04-07T21:05:03.305Z"},"id":"787e21d0-9b94-4415-adcd-df899f4fae4a","title":"Updated by Editor","description":"Still in draft mode","status":"draft","priority":"high","ownerId":"2","tags":[],"createdAt":"2026-04-07T21:02:46.057Z","updatedAt":"2026-04-07T21:05:03.305Z","metadata":{"version":2,"viewCount":2,"attachments":[],"extra":{}}}%

hunk01@Harshs-MacBook-Pro report-api % curl -X PUT http://localhost:3000/api/reports/787e21d0-9b94-4415-adcd-df899f4fae4a \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzIiwiZW1haWwiOiJhZG1pbkBleGFtcGxlLmNvbSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3NTU5NTY1NiwiZXhwIjoxNzc1NjgyMDU2fQ.4d0AnYDy5NCI2LJpVq872lOVHOtdnZcvds1j_a7TxhU" \
  -H "Content-Type: application/json" \
  -H "If-Match: "2"" \
  -d '{
"status": "published",
"justification": "Ready for production release"
}'
{"entries":[],"metrics":{"totalEntries":0,"avgEntryPriority":0,"highPriorityCount":0,"trendIndicator":"normal","lastActivityAt":"2026-04-07T21:05:43.930Z"},"id":"787e21d0-9b94-4415-adcd-df899f4fae4a","title":"Updated by Editor","description":"Still in draft mode","status":"published","priority":"high","ownerId":"2","tags":[],"createdAt":"2026-04-07T21:02:46.057Z","updatedAt":"2026-04-07T21:05:43.930Z","metadata":{"version":3,"viewCount":2,"attachments":[],"extra":{}}}%

hunk01@Harshs-MacBook-Pro report-api % curl -X PUT http://localhost:3000/api/reports/787e21d0-9b94-4415-adcd-df899f4fae4a \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwiZW1haWwiOiJlZGl0b3JAZXhhbXBsZS5jb20iLCJyb2xlIjoiZWRpdG9yIiwiaWF0IjoxNzc1NTk1NjQ4LCJleHAiOjE3NzU2ODIwNDh9.zN1bncDanxz6AlHuGJHswmWSRTyTfadMxQhJBakFsiM" \
  -H "Content-Type: application/json" \
  -H "If-Match: "3"" \
  -d '{"title": "Hacked by Editor"}'
{"error":"FORBIDDEN","message":"Only administrators may update published reports","statusCode":403,"timestamp":"2026-04-07T21:06:15.979Z","requestId":"5da1aa95-3385-47eb-b36b-3797763b6ae5","field":"status"}%

hunk01@Harshs-MacBook-Pro report-api % echo "Final workflow test content" > final.txt
curl -X POST http://localhost:3000/api/reports/787e21d0-9b94-4415-adcd-df899f4fae4a/attachment \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwiZW1haWwiOiJlZGl0b3JAZXhhbXBsZS5jb20iLCJyb2xlIjoiZWRpdG9yIiwiaWF0IjoxNzc1NTk1NjQ4LCJleHAiOjE3NzU2ODIwNDh9.zN1bncDanxz6AlHuGJHswmWSRTyTfadMxQhJBakFsiM" \
  -F "file=@final.txt"
{"fileId":"fd7466f51b7bec8f35ba89d23fac3415","originalName":"final.txt","size":28,"signedUrl":"/attachments/fd7466f51b7bec8f35ba89d23fac3415/download?expiry=1775599618&signature=66dd3557025be5ffbee245e05c105ed3"}%

hunk01@Harshs-MacBook-Pro report-api % curl "http://localhost:3000/attachments/fd7466f51b7bec8f35ba89d23fac3415/download?expiry=1775599618&signature=66dd3557025be5ffbee245e05c105ed3"

Final workflow test content
```

**How to read this trace**

| Step | HTTP | Meaning |
|------|------|---------|
| Issue editor/admin tokens | `200` | JWT issued for selected role |
| `POST /api/reports` | `201` | Report created; `metadata.version` starts at `1` |
| `GET` rich / compact | `200` | `viewCount` increments on read; shape differs by `view` |
| Editor `PUT` while draft | `200` | Version bumps (`1` → `2`) |
| Admin publish | `200` | `status` → `published`, version `3` |
| Editor `PUT` on published | **`403`** | Business rule: non-admin cannot mutate published |
| `POST .../attachment` | `201` | File stored; signed URL returned |
| `GET` signed download | `200` | Body streamed (example shows plain text) |

### Node server logs (correlation)

```text
info: createReport.success {"reportId":"787e21d0-9b94-4415-adcd-df899f4fae4a",...}
info: HTTP request ... statusCode:201
info: updateReport.success ... statusCode:200
info: HTTP request ... statusCode:403 ← business rule enforcement
info: uploadAttachment.success ... statusCode:201
info: attachment.download ... statusCode:200
```

### Automated test results (reference)

```text
Test Suites: 6 passed, 6 total
Tests:       11 passed, 11 total
```

Run `npm test` for the latest numbers on your machine.

---

## Transport security (HTTPS)

- **Production assumption:** TLS terminates at the edge (load balancer, API gateway, ingress). Clients talk **HTTPS**; the Node process may see HTTP on a private link (`ENFORCE_HTTPS` documents this contract).
- Set **`ENFORCE_HTTPS=true`** only when the proxy sets `X-Forwarded-Proto` (or equivalent) and you have enabled `trust proxy` semantics as in `src/app.ts`.
- **Never** send bearer tokens or signed URLs over untrusted networks without TLS.

Full rationale and operational notes: **`design.md`** → *Transport security assumptions*.

---

## Malware scanning (design-only)

This repository **does not** execute antivirus engines in-process. The intended production integration (async quarantine, ClamAV, retries, dead-letter) is documented in **`design.md`** → *Malware scanning integration*.

---

## Project layout (high level)

```
src/
  core/           # Domain entities, value objects, ports, errors
  modules/reports # Use cases, infrastructure, HTTP adapters
  shared/         # Auth, logging, middleware, queue, file storage
  app.ts          # Composition root
tests/            # Jest + Supertest
```

---

## Additional documentation

- **`design.md`** — Data model, security, concurrency, async processing, scaling, malware strategy, evolution.

---

## Support

For questions about behavior, start with **`design.md`**, then trace the use case under `src/modules/reports/application/` and the route in `src/modules/reports/interfaces/`.
