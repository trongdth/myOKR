# Output

## Expected Behavior

- User can export multiple invoices in one request.
- Export runs asynchronously.
- User can check export status and download the completed file.
- Existing single-invoice download continues working.

## Expected Development Workflow

- Always do Plan first
- Wait for human approval
- Spawn adversarial subagent to find edge cases.

## Acceptance Criteria

- [ ] User can export up to 500 invoices.
- [ ] User can only export invoices they have permission to access.
- [ ] Export returns an export ID.
- [ ] Completed export provides a downloadable file.
- [ ] Export activity is recorded in the audit log.

## Edge Cases / Failure Cases

- More than 500 invoices → request is rejected.
- Unauthorized invoice → invoice is not exported.
- Export job fails → status shows failure.

## Evidence Required

- [ ] Happy-path test
- [ ] Authorization test
- [ ] 500-invoice boundary test
- [ ] Regression test for existing download
