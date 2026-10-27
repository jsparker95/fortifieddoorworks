# Drawing takeoff pipeline

Status: implemented in draft PR #68 on `codex/pdf-extraction-jobs`. Production release is pending vision accuracy and authenticated browser verification.

## Processing and persistence

Uploading a project PDF starts an authenticated background job for the selected phase. Vercel Workflow indexes the complete file, screens non-index pages visually, locates schedule tables, extracts bounded schedule sections, and then analyzes enlarged plan crops. Each task and its output is persisted independently. Closing the file popup does not stop processing. The popup reconnects to saved progress; stop/resume retains completed work and avoids repeating successful model calls.

The first stage saves located schedule pages and a document description. The second stage incrementally saves openings, walls, door types, and hardware as AI drafts in an eligible empty phase (or a phase containing only drafts from that document). Existing unrelated phase data requires explicit candidate selection. Optimistic project updates protect concurrent edits; reviewed rows are preserved.

Literal schedule rows anchor opening counts, marks, dimensions, type codes, and explicit frame/rating/set columns. Model enrichment cannot replace these grounded values or invent an unprinted schedule hand. Building names scope references so repeated marks and set codes in separate buildings remain distinct. Referenced types with missing definitions receive clearly labeled incomplete placeholders; actual definitions replace them later. Hardware heading punctuation and zero padding are normalized for reference matching without merging different buildings or set suffixes.

## Segmentation and cost controls

- Preserve full text and vector coordinates for every PDF page.
- Classify non-index pages in batches of six; persist coverage. Large files may require resume for remaining batches.
- Extract bounded groups of schedule rows and hardware sets using text where reliable; use PDF vision for diagrams and scanned content.
- Group nearby known opening tags into bounded high-resolution crops. Use overlapping tiles where text positions are unavailable. Render one crop at a time.
- Run two sections concurrently, retain partial results, and cap new tasks per run. Resume processes remaining tasks.
- Account access or credit failures pause the workflow with an actionable message; they do not trigger requests for every remaining crop. Transient section failures remain retryable.

No trained architectural-door detector is connected. Vision-model boxes are proposals and require benchmark validation.

## Coordinate and handing contract

Geometry uses the displayed PDF rotation and CropBox, top-left origin, x increasing right and y increasing down. Models return crop-local normalized boxes, converted once to normalized page coordinates. Deduplicate overlapping observations and match exact door marks within a building. Unmatched or ambiguous symbols remain visible for review.

Use traditional handing from the outside/key side: left/right hinges with swing away yield LH/RH; swing toward yields LHR/RHR. Require visible evidence for the reference side, hinge, and swing. Unknowns stay blank. Non-swing openings do not receive a swing hand. Do not relax evidence checks to improve apparent completion rates.

## Configuration and access

`SUPABASE_SECRET_KEY` is server-only; private artifacts use the `document-analysis` bucket. Every worker step rechecks actor membership and source ownership. Browser payloads cannot supply arbitrary download URLs. Apply `20261023144042_document_extraction_jobs.sql` before deployment.

Vercel AI Gateway defaults to `google/gemini-2.5-flash`. `DOCUMENT_EXTRACTION_MODEL` overrides schedule/classification calls; `DOCUMENT_VISION_MODEL` separately selects plan vision. Model entitlement and credit availability must be verified. Preview configuration currently requests Gemini 2.5 Pro for plan validation; the account has rejected stronger-model calls under free-tier restrictions. Paid-credit approval is pending.

## Verification and release gates

The Rockingham public 64-page plan set produced 108 opening drafts, 199 hardware components, 33 wall rows, and 19 correctly scoped door types in the isolated QA project. These are extraction counts, not independently verified accuracy scores. Some types are explicitly incomplete placeholders. HCSO fixture tests preserve all 43 printed entries, including framed openings and previously omitted final rows. Rockingham fixture tests preserve 54 entries per building.

Before release: validate plan handing against reviewed geometry using an eligible stronger model; verify upload, progress, reopen, stop/resume, and phase review through an authenticated browser; require full tests, typecheck, build, audit, and GitHub CI; integrate cumulative latest main through a guarded PR merge; confirm the main production deployment is READY. Do not describe this feature as production-ready while these gates remain open.
