# Make the Revise invoice dialog scroll properly

The dialog already wraps its body in a scroll area, but the content still grows past the viewport instead of scrolling, so the footer buttons and lower sections can be pushed out of reach.

## What changes

- Constrain the dialog body so it scrolls inside the dialog: the scrollable region gets a proper minimum-height reset so the flex column can shrink, keeping the header and the action footer always visible.
- Apply the same treatment to the loading/error states so the dialog height stays stable.
- Keep the inner "Still zero" list scroll behaviour, but let the outer scroll handle overall page length so there are no nested scroll traps on small screens.

## Technical detail

In `src/components/invoices/RevisionDialog.tsx`:
- `DialogContent` (line 576): keep `max-h-[90vh] flex flex-col`, add `overflow-hidden`.
- `ScrollArea` (line 608): change to `flex-1 min-h-0 pr-4` so the flex child can shrink and the viewport scrolls.
- Inner list at line 796: relax the fixed `max-h-72` to a larger cap (or remove the inner scroll) so the outer scroll drives long lists.
- No logic or calculation changes.
