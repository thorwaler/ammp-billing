# Fix Revise Invoice scrolling so all sites are reachable

## Current diagnosis

The Revise invoice dialog uses a flex layout with a `ScrollArea`, but the shared dialog component still includes `grid` in its base classes. Because Tailwind class merging does not remove `grid` when `flex` is added, the dialog can end up as both `grid` and `flex`; CSS order makes the layout behave like grid, so the intended `flex-1 min-h-0` scroll region is not reliably constrained. That matches the symptom: the dialog says there are 7 still-zero sites, but only 5 are visible and the remaining content is not reachable.

## What I will change

- Update only the Revise invoice dialog layout.
- Make the dialog use an explicit height cap (`h-[90vh]`) instead of only `max-h-[90vh]`, so the scroll viewport has a real bounded height.
- Override the shared dialog's default grid display with `!flex !flex-col` for this dialog.
- Keep the header and footer fixed inside the dialog while the middle body scrolls.
- Add a small bottom padding inside the scroll body so the last site row and the reason field are not hidden behind the footer.
- Keep the existing Still zero list, battery buttons, manual fields, ignored-asset controls, and invoice calculation logic unchanged.

## Technical details

Target file:

- `src/components/invoices/RevisionDialog.tsx`

Expected changes:

- `DialogContent` class changes from a max-height flex attempt to an explicit fixed viewport-height flex column, e.g. `h-[90vh] max-h-[90vh] !flex flex-col overflow-hidden`.
- `ScrollArea` remains the only scroll container, but gets a fully constrained flex slot, e.g. `flex-1 min-h-0 overflow-hidden`.
- Inner content gets right/bottom spacing rather than relying on padding on the ScrollArea root, e.g. `space-y-4 pr-4 pb-2`.
- Footer gets `shrink-0` so it never consumes the scrollable region or disappears.

## Validation

- Open a Revise invoice dialog with more still-zero sites than fit on screen.
- Confirm the body scrolls and all listed sites are reachable.
- Confirm the footer buttons remain visible.
- Confirm no invoice total or correction-selection logic changes.
