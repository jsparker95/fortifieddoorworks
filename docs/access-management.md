# Access management release

## Production baseline inspected on October 8, 2026

The live workspace has two members: Joseph (`jsparker95@gmail.com`, Operator) and Brian (`brian@fortifieddoor.com`, Manager). No Global Admin role or in-app membership editor exists in that baseline. Current management is through Supabase Authentication → Users for accounts and `public.workspace_members` for approved emails and roles. Removing a membership row can be blocked by production-history foreign keys; do not delete history to work around that.

All public app tables have RLS enabled. Members have broad shared business-data editing; Managers additionally maintain vendors and review production time. Private project-document storage and public avatars are separate buckets. Neither account has an enrolled MFA factor. Supabase's security advisor reports leaked-password protection disabled. This feature does not configure MFA or leaked-password detection.

## Design and authorization

`workspace_members.active` supports reversible revocation while preserving foreign keys. Keep its SELECT policy **self-only and active-only**: existing business/storage policies depend on the existence of that visible membership row. Never broaden it to let administrators list every member directly. The guarded list RPC provides that list instead.

Public invoker RPCs call private, fixed-search-path definer functions. Private functions verify `auth.uid()` against the current Auth user and active Global Admin membership, never user-editable metadata. They return only necessary account status fields, not credentials. Ordinary clients cannot directly mutate membership or audit records. Writes are serialized by a membership-table lock, then reauthorize the caller and compare `access_version`. They reject self-demotion/revocation and loss of the last administrator. Changes and their audit entries commit together.

Restrictive RLS also requires active membership on work sessions and storage, so owner-only policies cannot bypass revocation. Existing manager policies/functions are extended to Global Admin, including the deployed phase-cleanup policies/function when present. Time-review updates also require a non-null matching reviewer identity.

History covers administration through this feature and initial role promotion, not SQL operations by infrastructure administrators or profile edits. Revocation prevents subsequent authorized requests, not already downloaded content, public avatar URLs or previously issued signed file links. It retains the Supabase Auth account and does not alter MFA/password settings.

## Release procedure

Follow the project-wide WORKFLOW.md. This is a task branch, not a production source. Integrate with the latest `origin/main`, run tests/typecheck/build and require GitHub CI to pass. Release only after the user requests production release.

The matching Supabase project is `psgdgzzmvdftxjaxyqtu` (fortifieddoors). Apply `supabase/migrations/20261009033356_workspace_access_management.sql` once as a tracked production migration. It requires the existing workspace, time-tracking, vendor and profile migrations; do not replay `database/schema.sql` against production. It fails if either requested administrator is missing.

Coordinate migration and app deployment: older app clients recognize only Manager/Operator, so promoting administrators before the new app loads can temporarily hide Manager controls. Have both administrators reload after the cumulative main deployment is ready. Verify both accounts are active Global Admins, `/access` works, and Manager/Operator behavior remains correct. Run the Supabase security advisor after applying the migration. Do not revert the database blindly: preserve the member/audit history and reconcile role assignments explicitly if rolling back the UI.

## Verification

- `npm test`: embedded PostgreSQL (PGlite) exercises actual RLS/functions with separate authenticated/anonymous identities. Covers both seeded administrators, manager parity, denied self-promotion, direct-write denial, stale changes, revocation with existing tokens, restoration with retained history, audit integrity, and definer function privileges/search paths.
- `npm run typecheck` and `npm run build` validate the app and `/access` route.
- Browser verification can use `npx tsx tests/access-fixture-server.ts` plus `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-fixture-key npm run dev -- --port 3017`. This binds only to loopback and uses a throwaway PGlite database, never production. Fixture identities from `tests/access-db.ts` use password `local-test-only`. Do not deploy this fixture server.
- Verify add, role change, revoke, restore and their audit rows; verify an Operator cannot see administration controls or use the direct `/access` route.

Production migration/application verification remains a release step; local browser testing does not establish production deployment success.
