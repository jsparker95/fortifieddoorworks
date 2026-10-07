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

Each project starts with one default phase. Phases are peers without a parent/child hierarchy: split the whole project or any existing phase into multiple phases, by floor or any other opening selection, and repeat as needed. Splitting preserves stable opening IDs and assigns openings and their production milestones to the selected phase. Walls, door types and hardware definitions are copied into each result so phases can evolve independently. Phase changes are project edits and must be saved.

Add walls and door types, hardware group components, and openings. The application derives frame depths, door attributes, modifications, part names, grouped takeoffs and hardware quantities. Existing dropdown options live under Settings. Reference acronyms and material descriptions are editable there too.

All project edits are explicit: click **Save changes**. An optimistic version check prevents silently overwriting another user's changes. Use **Export JSON backup** before resolving a save conflict. Project status can be changed to Archived instead of deleting the project. Excluded openings retain their original records and milestones but are excluded from all production quantities.

Bulk paste accepts CSV or tab-separated data with a header row. Export the section's CSV to see supported column names. Validate and review imported entries before production. Existing quantity and P.R. source fields remain available; count calculations follow one opening record per opening, as in the source workbooks.

Production tracks dated milestones for frames, doors and hardware. QR links open the matching project, phase and opening; older printed labels keep working after repeated phase splits by resolving the opening through split history. Operators can clock a shift, time one frame/door/hardware task at a time, and submit coded work (cleaning/staging, delivery, inventory, support, training, or other). Coded time remains included in efficiency until a manager approves it. Daily efficiency is calculated as completed frame piece-rate credit divided by shift hours less approved coded hours. Set a frame's piece-rate credit in its Opening record and save the project before starting the task; the database snapshots the persisted credit when a timer starts. Production timer records save directly to Supabase; the corresponding production-board milestone is a project edit and must be saved. Brian Jarvis's existing allowlisted account is assigned manager role by the migration; new allowlisted accounts default to operator. Reordering or editing opening marks cannot transfer history to another opening because records use stable IDs. Takeoff selection checkboxes are saved and can drive a selected-only takeoff PDF.

The Production section includes an optional installation package estimator. It derives single/double frame and door counts from the schedule, derives hardware counts from each hardware line, and requires hardware lines to be assigned an installation category. Per-phase labor hours and sell-price assumptions are editable and saved with the phase; zero defaults intentionally avoid inventing company pricing. Opening schedules default frames to DKS, or DCI for the 5¼-inch wall size, and hardware to IML when those vendors exist in the directory; project overrides remain editable. Current vendor lead times are resolved in the schedule. The Takeoff section can print one aggregate anchor-package QR label, grouped by anchor size and type; scanning it opens the matching phase, where staged and delivered milestones can be recorded. Anchor mounting methods should be explicitly selected when known; the takeoff fallback follows the transcript (wood-stud anchors, six per frame, eight on 8-foot-or-taller frames, short lag for knockdown frames).

Documents include submittal summaries, takeoffs, opening schedules, build sheets, phase-aware door/frame/hardware labels with QR links back to the opening's project phase, and printable elevation drawings for glazed openings and sidelights. Elevations store dimensions, glass stops, chair rails, mullions, weld counts, and notes per opening. PDFs can be uploaded per phase (plans, specifications, addenda, and construction sets), indexed for up to 2,500 pages, and analyzed on demand. Page finding prioritizes Division 08, wall, door and hardware schedules, floor plans and window/sidelight schedules. AI results include page citations, extracted evidence and confidence, remain provisional, and require deliberate human selection before they are added to a phase. A scanned PDF without selectable text is identified and can be re-uploaded after OCR. Uploads are private in Supabase Storage and capped at 100 MB. Configure `AI_GATEWAY_API_KEY` locally if Vercel AI Gateway OIDC is unavailable; `DOCUMENT_EXTRACTION_MODEL` selects the model.

Print hardware labels at the reference 4 x 2 inch size. Their heading, left-aligned hardware lines, door-type/job line, and overflow page numbering follow the available label sample; a QR code sits in reserved right-side space and links to the opening. Long hardware lists continue onto additional numbered labels rather than being clipped. The recovered Apps Script is the submittal generator, not the label generator, so QR placement still needs a physical-stock print check.

## Deployment

The Vercel project is `fortifieddoors`; the GitHub repository is `fortifieddoorworks`. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and (for local extraction) `AI_GATEWAY_API_KEY` for production and previews. Apply additive database migrations in `database/migrations/` to the existing production Supabase project; do not rerun `database/schema.sql`. `vercel.json` selects Next.js. Git pushes to the connected production branch deploy through Vercel.

Set the Supabase Auth site URL and allowed redirect URLs to the production application URL before sending users through email confirmation or password recovery. The browser application supports account creation and password sign-in; users must confirm their email and be in the workspace allowlist.

## Scope and remaining source dependencies

Wood Door Order Form and Door Machining Specifications remain deferred. The recovered Apps Script builds a Google Docs submittal from each opening, its frame, door and hardware; the replacement PDF now follows that per-opening content pattern. The linked Google Docs template and label-generator script remain inaccessible, so final approval-package styling and label-stock alignment still need comparison against accessible copies or physical print samples. The local label sample is matched for size and content layout; print a physical sheet before production use to confirm stock alignment.
