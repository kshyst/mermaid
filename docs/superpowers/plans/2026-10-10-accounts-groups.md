# Accounts and Groups Implementation Plan

**Goal:** Replace shared Basic Auth with individual accounts, one-day JWT access tokens and creator/group diagram access.

**Architecture:** Python authenticates JWT cookies and checks user/group access against SQLite. React mounts a user-scoped workspace only after session validation. Nginx proxies authentication cookies and removes Basic Auth.

- [x] Add password/JWT/session helpers and persistent signing key.
- [x] Migrate users/groups/memberships/diagram creator fields and enforce access in database operations.
- [x] Add auth/group APIs and remove trusted identity headers and Nginx Basic Auth.
- [x] Add account UI, per-user drafts, group management, filters and diagram assignment.
- [x] Verify auth/ACL/migration/retention and frontend regressions.
- [ ] Back up data, build locally, push and deploy both services with persistent state.

Validation: 18 backend and 62 frontend tests passed, covering JWT claims/lifetime/expiry/logout, password hashing, legacy migration, foreign creator protection, private/group access and membership revocation, SQL deletion blocking, registration/sign-in/sign-out, account cache isolation and group management UI. UI checks use a simulated DOM. Pre-migration backups were prepared for local and remote databases.

Group access refresh also preserves unsaved work in a separate private draft after membership removal, while hiding the revoked original.
