# Report API — Design Document

This document describes the architecture, data model, security model, concurrency, asynchronous processing, operational posture, and volution path for the Report API service. It is written for engineers onboarding to the codebase or reviewing the system for production readiness.


## 1. Schema and data model

### 1.1 Core aggregates

- Report: Child records nested under a report (time-series or line-item style content). They are modeled as part of the report’s consistency boundary in the domain; persistence maps them to a structure suitable for the chosen adapter (in-memory maps in this reference implementation).

### 1.2 Why nested entries

- Domain cohesion: Entries belong to one report; lifecycle and invariants (ordering, limits, aggregation) are easier to reason about when they are modeled inside the aggregate.

- API flexibility: Clients can request rich views (entries + metrics) or compact summaries without separate cross-service joins in the common case.

- Evolution: New entry types or optional fields can be added without breaking the report’s top-level contract when versioning and optional payloads are used consistently.

### 1.3 Versioning on metadata

- `metadata.version` is incremented on each successful mutation that changes persisted state. It backs `ETag` / `If-Match` for optimistic concurrency (see §3).

- View count and similar counters are updated on read paths where required; they participate in the same version bump when they are persisted as part of the aggregate update, keeping a single source of truth for “last writer wins” semantics.

### 1.4 Computed metrics

Metrics (e.g. total entries, averages, trend indicators, last activity) are derived from entries and report state rather than stored as authoritative financial data. This:

- Avoids drift between stored aggregates and raw entries.
- Allows algorithm changes without migrations (recompute on read or on bounded refresh jobs in a larger deployment).
- Keeps the read model honest: clients see numbers consistent with the entries returned in the same response (subject to pagination filters).

---

## 2. Authentication and authorization

### 2.1 JWT bearer tokens

- Clients obtain short-lived access tokens via `POST /auth/token` by selecting one of three known users (`user-reader`, `user-editor`, `user-admin`). In production this would be replaced by an identity provider (OIDC) or internal SSO; the pattern (stateless JWT) remains the same.
- Protected routes require `Authorization: Bearer <token>`.

### 2.2 Roles

| Role | Capabilities (summary) |
|------|-------------------------|
| reader | Read reports (`GET`). |
| editor | Create reports, update draft reports, upload attachments. |
| admin | Editor capabilities plus controlled updates to published reports when justification is supplied (see README). |

Authorization is enforced in two layers where appropriate: HTTP/controller guards for fast failure, and domain rules in use cases so invariants cannot be bypassed by a future adapter.

### 2.3 Why HS256 (symmetric signing)

- Simplicity and latency: HMAC-SHA256 (`HS256`) verification is fast and has minimal cryptographic surface for a single-tenant or controlled deployment.
- Operational model: All API instances share 'JWT_SECRET'; no public key distribution or JWKS rotation machinery is required for the reference service.
- Production note: For multi-tenant systems or public clients, asymmetric algorithms (`RS256`/`ES256`) with key rotation and JWKS are typically preferred. Migrating from HS256 to RS256 is a deployment concern (new issuer, dual validation window) rather than a domain change.

---

## 3. Concurrency control

### 3.1 ETag and If-Match

- `GET /api/reports/:id`returns an `ETag` derived from the current `metadata.version` (weak ETags are acceptable for JSON payloads).
- `PUT /api/reports/:id` requires `If-Match` matching the expected version. On mismatch, the API responds `409 Conflict` so clients can merge or refetch.

### 3.2 Optimistic locking rationale

- Scales horizontally: No distributed locks; each instance can validate version in memory or storage.
- Predictable UX: Editors see explicit conflicts instead of silent last-write-wins over published content.
- Pairs with idempotency: `Idempotency-Key` on `POST` reduces duplicate creates; `If-Match` protects concurrent edits.

---

## 4. File storage security

### 4.1 Upload path

- Authenticated `POST /api/reports/:id/attachment` accepts multipart `file`. Size and MIME type are constrained by configuration.
- Files are stored under `UPLOAD_DIR` with a content-addressed or random identifier (`fileId`) to avoid collisions and path traversal.

### 4.2 Signed download URLs

- Downloads use `GET /attachments/:fileId/download?expiry=<unix>&signature=<hmac>` without a JWT.
- `signature` is an HMAC over the resource identity and `expiry` using `SIGNED_URL_SECRET`. This yields:
  - Time-bounded access (expiry).
  - Tamper resistance (changing `fileId` or `expiry` invalidates the signature).

### 4.3 Operational guidance

- Use short TTLs for signed URLs in untrusted contexts; regenerate on demand.
- Prefer TLS for all transport (see §8).
- Treat `SIGNED_URL_SECRET` with the same care as `JWT_SECRET`.

---

## 5. Asynchronous side effects

### 5.1 Queue and workers

Post-commit work (notifications, analytics, derivative indexing) is modeled as jobs enqueued on an in-memory queue with:

- Exponential backoff on transient failures (simulated in reference code via configurable failure rate).
- Retry budget per job; exhausted jobs move to a dead-letter path (logged / inspectable in a full implementation).

### 5.2 Why async

- Latency: HTTP handlers return after the aggregate is persisted; slow I/O does not block users.
- Resilience: Retries isolate flaky downstream systems from user-visible errors (when compensating actions are not required).

### 5.3 Production mapping

Replace the in-memory queue with SQS, RabbitMQ, Kafka, or Cloud Tasks, preserving idempotent consumers** and at-least-once semantics.

---

## 6. Malware scanning integration (design-only)

This repository does not bundle or run ClamAV. The following is the intended production design for defense-in-depth on user uploads.

### 6.1 Pipeline

1. Ingest: On upload completion, persist file metadata as `pending_scan` (or equivalent) and enqueue a scan job (never block the HTTP response on scan completion).
2. Scan: A ClamAV (or vendor API) worker pulls jobs, streams the object from object storage, and records `clean` / `infected` / `error`.
3. Quarantine: Infected objects remain unavailable for download; optionally move blobs to a quarantine bucket with restricted IAM.
4. Retries: Transient scanner errors use exponential backoff; permanent failures route to dead-letter with alert hooks.

### 6.2 Async quarantine

- Do not delete suspicious files synchronously in the request path; mark and isolate first.
- Notify security workflows (SIEM, ticket) on positive matches; retain evidence per policy.

### 6.3 Contract with clients

- API may return `201` with `scanStatus: pending` and block `200` downloads until `clean`, or serve only to trusted internal callers— product decision documented in the public API spec.

See `README.md` → Malware scanning for the user-facing pointer.

---

## 7. Code quality practices

- TypeScript `strict`— Catches nullability and typing errors early; aligns with Zod runtime validation.
- Zod — Request/query/body validation at the edge; single source for inferred TypeScript types where applicable.
- Structured logging — JSON logs with request IDs for correlation across middleware, use cases, and error handlers.
- Testing — Jest + Supertest for HTTP-level behavior (status codes, headers, conflict paths). Domain logic remains testable without booting HTTP where pure.

---

## 8. Scaling and observability

### 8.1 Stateless application tier

- JWT validation requires no server-side session store.
- File metadata in this reference implementation is in-memory; production uses object storage + database.

### 8.2 Request IDs

- Each request receives a correlation ID propagated to logs and error payloads, enabling trace stitching in APM/log platforms.

### 8.3 Rate limiting

- Token bucket (or fixed window) per client key (IP + optional API key) protects against abuse; tune `RATE_LIMIT_*` for environment.

### 8.4 Transport security assumptions

- Terminate TLS at the edge; optionally `ENFORCE_HTTPS` when behind a trusted proxy that sets forwarded protocol headers. See `README.md`→ Transport security.

---

## 9. Evolving the specification

### 9.1 New metrics

- Add fields to the metrics DTO and compute them in the mapper or a dedicated read model. Prefer versioned metric blocks if external dashboards depend on stable shapes.

### 9.2 New views

- Extend `view` enum and response mapping (`rich` / `compact` / future `audit`). Avoid breaking existing clients: add optional fields or new view names rather than repurposing semantics.

### 9.3 Storage backends

- Implement repository ports for PostgreSQL, DynamoDB, or document stores without changing domain entities; mappers translate persistence rows to aggregates.

### 9.4 API versioning

- Prefer additive changes and `Accept`/header versioning or path prefix (`/v2`) when breaking changes are unavoidable; maintain overlap window for clients.

---

## 10. Summary

The Report API balances clear domain boundaries, stateless auth, optimistic concurrency**, signed URLs for downloads, and async processing hooks suitable for hardening in production. Malware scanning and external queues are explicitly designed even when not fully implemented in this reference tree, so operators can extend the system without redesigning the core model.
