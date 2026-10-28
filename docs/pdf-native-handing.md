# PDF handing evidence

Schedule extraction and handing are separate operations. Searchable schedule rows
remain the inventory of openings and hardware. Vision enrichment cannot replace
literal marks, dimensions, materials or part numbers from those rows.

For native construction drawings, `vector-pdf.ts` reads the displayed PDF paths.
It requires a circular quarter arc and a straight radial door leaf, verifies both
against the rendered page, and attaches a nearby printed schedule mark. The arc
center is the hinge; the other end of the arc is the closed latch jamb.

Closed openings are temporarily sealed in two rendered boundary maps. A hand is
calculated only when both maps agree on the reference side and hand. References
are a bounded, labelled corridor or the building exterior established from the
overall plan. Enlargements do not establish a reference side. Shared latch jambs
identify paired leaves, which do not receive a single-leaf hand. Room-to-room
openings, two corridor sides, unsupported paths and uncertain associations remain
blank. Non-swing schedule types also remain blank.

Vision-only detections retain their raw response for review, but cannot populate
an automatic hand. Native observations are source evidence, still saved as drafts
requiring human review. Resuming a legacy job replaces its provisional model
hands with native evidence while preserving reviewed rows and paid-call history.
Cached native sections do not consume the model-call budget.

## Regression checks

`tests/drawing-takeoff-vector.test.ts` covers all four hands under rotations,
radial leaf support, pairs, reference ambiguity, enlarged views, the free section
budget and a generated PDF through path parsing, rendering, region assignment,
handing and citation validation.

The public Rockingham plan set was also inspected locally without AI calls:
overall PDF pages 2 and 16 produce 33 and 31 suggestions; detail pages 3 and 17
produce no automatic hand. Source checks include 127/131/132 RH, 129/130 LH,
151 LH and exterior 104 LHR. Opening 134 has corridors on both sides and remains
unknown. These checks do not establish accuracy for other plan conventions or
raster-only PDFs; those require further reference evidence or manual review.
