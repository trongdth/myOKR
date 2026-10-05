# TODO: Bulk Invoice Export

## Phase 1: Data Model & Export Request

Goal: Define the shape of an export request and its result before wiring any UI.

- [ ] Define `ExportRequest` (invoice IDs, requester, scope) and `ExportJob` (id, status, file URL) types.
- [ ] Decide how permission-checked invoice IDs are resolved from the request.
- [ ] Stub an endpoint that accepts a request and returns an `export_id`.

**Definition of Done:** Posting a request with valid invoice IDs returns an `export_id`; no file generation yet.

## Phase 2: Authorization & Validation

Goal: Reject invalid or unauthorized requests before any work starts.

- [ ] Enforce the 500-invoice maximum per export.
- [ ] Filter out invoices the requester cannot access; reject the request if any are unauthorized.
- [ ] Return a clear error listing which invoice IDs failed validation.

**Definition of Done:** A request with 501 invoices, or any invoice outside the requester's access, is rejected with a specific error — no job is created.

## Phase 3: Async Job Execution & Status

Goal: Run the export in the background and let the user poll for completion.

- [ ] Implement the background job that generates the export file.
- [ ] Persist job status (`pending` / `running` / `completed` / `failed`).
- [ ] Expose a status endpoint keyed by `export_id`.
- [ ] Record the export in the audit log on completion.

**Definition of Done:** A submitted export transitions from `pending` to `completed` (or `failed`) without blocking the request thread, and the audit log has one entry per export.

## Phase 4: Download & Regression Check

Goal: Deliver the finished file and confirm the existing single-invoice download still works.

- [ ] Expose a download endpoint for a `completed` job's file.
- [ ] Handle `failed` jobs with a status message instead of a broken download link.
- [ ] Run the existing single-invoice download flow end-to-end to confirm no regression.

**Definition of Done:** A completed job's file downloads successfully; a failed job surfaces its failure reason; single-invoice download is unaffected.
