# Fix alert details showing "[object Object]"

The alert data is fine — the stored details for both alerts contain full asset and org records (e.g. `{ assetId, assetName, orgName }` for the double-count alert). The problem is purely display: the alert card renders every detail value with a plain string conversion, so arrays of records collapse into `[object Object],[object Object],...`.

## What to change

In the alert card's "Details" block:

- Scalars (numbers, strings, booleans) render as today.
- Arrays of records render as a readable list instead of one squashed line: each entry shown as its name (asset name, org name) with secondary info (MW, tier, org) next to it, dimmed. IDs are not shown in the list — they are noise for reading; keep them only in the copy/expanded view.
- Long lists collapse: show the first 10 entries with a "Show all N" toggle.
- Nested plain objects render as key/value sub-lines rather than `[object Object]`.
- Array-of-record entries span the full width of the details grid; scalar entries keep the current two-column layout.

Result: the double-count alert lists the 35 assets with their sub-org, and the sub-org alert lists the 152 uncovered assets and the orgs by name, with the numeric totals (uncovered, uncoveredMW, strandedMW, coveredElsewhere) unchanged above them.

## Technical details

Single file: `src/components/alerts/AlertCard.tsx`.

- Add a small `renderValue` helper plus a `DetailList` sub-component (local to the file) handling: number, string/boolean, array of primitives, array of objects, plain object.
- Label resolution for record entries: prefer `assetName` → `orgName` → `name` → `title`, falling back to a compact key/value join; secondary line built from the remaining non-id fields (`mw`, `tierName`, `orgName`, `capacityMw`), formatting numbers to 2 decimals.
- Keys ending in `Id`/`id` are excluded from the visible summary line.
- Collapse state via local `useState` per detail key; default 10 visible.
- No changes to the edge functions or alert metadata shape.
