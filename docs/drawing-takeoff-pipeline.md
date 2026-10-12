# Drawing takeoff pipeline

Status: prototype connected to PDF project-file uploads and phase data in this branch. Production has not been changed.

## Coordinate contract

Geometry uses the rendered page in its displayed rotation, top-left origin, x increasing right, y increasing down. Render the PDF CropBox and rotation consistently. Detection providers return boxes normalized to each crop. Convert once to global page pixels; record rendered page dimensions with each result. Never mix PDF bottom-left points, crop-local pixels, and full-page pixels.

`lib/drawing-takeoff/geometry.ts` plans bounded overlapping tiles, maps local boxes to global coordinates, suppresses duplicate detections, and records observed swing geometry. `matching.ts` joins detections to schedule rows by exact normalized door marks. Punctuation is preserved. Duplicate IDs, unreadable tags, unmatched rows, incomplete dimensions, and missing handing stay visible for review.

## Current prototype and remaining stages

Uploading a PDF from a project with an active phase opens the file dialog and starts analysis. The route reads the stored PDF, sends up to 10 automatically selected pages (plus manual selections, up to 36 total) to a multimodal model through Vercel AI Gateway, and samples scanned pages across the document. It asks for doorway observations and matches exact marks against extracted schedule rows. Extracted openings, walls, door types, and hardware are inserted into the target phase as `ai-draft` rows and the project is saved with optimistic version checks. Re-analysis refreshes matching AI drafts without replacing human-reviewed rows. If analysis finishes but the browser closes before import, opening the file again imports the saved analysis idempotently. Coverage counts expose scanned pages that were not screened. All results remain provisional and require source-page review. Page crops and a trained doorway detector are not connected; the vision model itself supplies the proposed boxes.

1. Index every page, preserving vector text positions. The current route classifies scanned pages by lack of extracted text and samples up to 8 across the document; it does not establish full visual coverage for large sets.
2. Render overview images for page classification, then selected plan tiles at configurable high resolution. Render one crop at a time rather than allocating a giant sheet bitmap. Persist coverage and failures; incomplete pages must never appear complete.
3. Detect doorway boxes and tag text, with source coordinates and confidence. Accept a configured trained CV detector or a vision-model provider. A stock object detector is not evidence of architectural-door accuracy. Do not silently substitute a language-model detector while claiming trained CV.
4. Extract door/hardware/wall schedules in bounded batches. Retain source page, evidence, revision, and unknown fields.
5. Deduplicate overlapping crop results and join exact door IDs to schedule rows. Ambiguous rows stay unresolved. Infer physical dimensions only from explicit schedule/drawing dimensions, never pixel size without a calibrated drawing scale.
6. Present source crops, schedule evidence, conflicts, and editable candidate fields in the project file dialog. Apply only explicitly reviewed selections to the chosen phase.

## Handing

Use the traditional convention from the outside/key side: hinges on left/right establish LH/RH; when the door swings toward that observer, use the reverse hand LHR/RHR. Apply it only when the reference side, hinge, and swing are clear. Pairs, double-acting doors, sliding doors, and unclear symbols require review.

## Execution and access

Keep authentication and project/document authorization in the existing app. Heavy CV inference and large-sheet rasterization need a bounded worker with per-document jobs, cancellation, retries, authenticated requests, and durable progress. The present 120-second synchronous PDF route is unsuitable for an entire large drawing set. Never accept arbitrary remote URLs from browser payloads or disclose storage credentials. Provider keys belong in server environment configuration.

The route currently uses `google/gemini-2.5-flash` through Vercel AI Gateway by default; `DOCUMENT_EXTRACTION_MODEL` can override it. Gateway model eligibility depends on account credits/entitlements, so this configuration does not guarantee free-tier access. Benchmark detections against manually reviewed plans before reporting accuracy. No trained detector weights or accuracy claims are supplied by this prototype.
