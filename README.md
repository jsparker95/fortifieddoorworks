# Fortified Doorworks

Manufacturing workspace for master buildings, individual jobs, opening schedules, hardware, takeoffs, production tracking and printable documents.

## Stack

Next.js / React / TypeScript, Supabase Postgres and Auth, Vercel hosting. Browser data access uses a publishable key; row-level security restricts all production records to approved workspace members. No service-role key is included in this application.

## Run locally

1. Install Node.js 24 and run `npm ci`.
2. Copy `.env.example` to `.env.local` and provide the Supabase URL and publishable key.
3. Apply `database/schema.sql` to a new Supabase project. Do not reapply it to the already-provisioned production project.
4. An administrator must add the approved email address to `public.workspace_members` using the Supabase SQL editor. Store email addresses in lowercase. Members have access to the shared company workspace; self-registration alone does not grant data access.
5. Run `npm run dev`.

## Verification

- `npm test`: production formulas, alternatives, exclusions, fire-rating fallback, large schedules and CSV parsing.
- `npm run typecheck`: TypeScript validation.
- `npm run build`: production build.
- Source-workbook comparison tests run only when private files exist under `discovery/` and `local-data/`. Those directories must never be committed or deployed.

A local-only preview at `/?preview=1` uses `local-data/seed.json` when running the development server. Its API returns 404 in production. The preview never writes production records.

## Workflow

Each workbook is a separate manufacturing project, grouped under its building. Create an empty job, copy project schedules into a new job, or duplicate an entire existing project. Add walls and door types, hardware group components, and openings. The application derives frame depths, door attributes, modifications, part names, grouped takeoffs and hardware quantities. Existing dropdown options live under Settings. Reference acronyms and material descriptions are editable there too.

All project edits are explicit: click **Save changes**. An optimistic version check prevents silently overwriting another user's changes. Use **Export JSON backup** before resolving a save conflict. Project status can be changed to Archived instead of deleting the project. Excluded openings retain their original records and milestones but are excluded from all production quantities.

Bulk paste accepts CSV or tab-separated data with a header row. Export the section's CSV to see supported column names. Validate and review imported entries before production. Existing quantity and P.R. source fields remain available; count calculations follow one opening record per opening, as in the source workbooks.

Production tracks dated milestones for frames, doors and hardware. Reordering or editing opening marks cannot transfer history to another opening because records use stable IDs. Takeoff selection checkboxes are saved and can drive a selected-only takeoff PDF.

Documents include submittal summaries, takeoffs, opening schedules, build sheets, and size-configurable door/frame/hardware labels. Print labels at actual size. Long hardware packages continue onto additional numbered labels rather than being clipped.

## Deployment

The Vercel project is `fortifieddoors`; the GitHub repository is `fortifieddoorworks`. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for production and previews. `vercel.json` selects Next.js. Git pushes to the connected production branch deploy through Vercel.

Set the Supabase Auth site URL and allowed redirect URLs to the production application URL before sending users through email confirmation or password recovery. The browser application supports account creation and password sign-in; users must confirm their email and be in the workspace allowlist.

## Scope and remaining source dependencies

Wood Door Order Form, Door Machining Specifications, and Elevation Drawings are intentionally deferred. The source Apps Script and linked generated Google Docs were unavailable during this implementation. PDF and label generation is implemented, but parity with the original Apps Script output, physical label stock and any external product-cut-sheet assembly requires those sources or printed samples. Do not treat generated submittal summaries as a verified replacement for an unseen approval package.
