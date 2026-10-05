EPIC: Bulk Invoice Export

# Problem

Customers managing many invoices must currently download
each invoice individually.

# Goal

Allow users to export multiple invoices together.

# Users

- Finance administrators
- Account owners

# User journey

1. User selects invoices.
2. User requests export.
3. System prepares export.
4. User downloads the result.

# Business rules

- Only accessible invoices can be exported.
- Maximum 500 invoices per export.
- Audit trail must be preserved.

# Assumptions & Constraints

Assumptions (including external dependencies):

- Invoice storage API supports batch reads.
- File storage for export results is provisioned before build starts.

Constraints:

- Export must not bypass existing invoice permissions.
- Audit log entries are append-only.

# Out of scope

- Scheduled exports
- Email delivery
- Cross-workspace export

# Acceptance criteria

Business-level criteria the client signs off on. Reference SOW items
where applicable; testable detail belongs in OUTPUT.md.

- A customer can export selected invoices without manually
  downloading them one at a time.
- An export of up to 500 invoices completes and is recorded
  in the audit trail.
