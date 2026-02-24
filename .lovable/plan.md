

## Fix SharePoint Integration: Editable File Path + Text Overflow

### Problem
1. The SharePoint folder path is not directly editable -- users must use the folder browser to change it.
2. The folder path text overflows its container instead of being properly truncated or wrapped.

### Changes

#### `src/components/integrations/SharePointIntegration.tsx`

**Fix 1: Text overflow (line 290-300)**
- The container `div` with class `flex-1` has no `min-w-0` to allow truncation inside flex containers.
- Add `min-w-0` to the `flex-1` div and `overflow-hidden` to ensure the path text truncates properly with the existing `truncate` class.

**Fix 2: Editable file path**
- Change the folder path display from a static `<p>` tag to a clickable element that opens the folder browser for that document type, so users can easily re-select/edit the path.
- Add a small "edit" icon button next to the path text (using the `Pencil` icon from lucide-react) that triggers the folder browser for that specific document type.
- This reuses the existing `Browse` button logic -- clicking the path or the edit icon sets `selectedDocType` and opens the folder browser.

### Summary of Edits

| Line Range | Change |
|---|---|
| Line 6 | Add `Pencil` to lucide-react imports |
| Lines 290-312 | Add `min-w-0` to flex-1 container; make path text clickable to open folder browser; add edit icon button |
