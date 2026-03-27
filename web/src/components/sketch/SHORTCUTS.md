# Shortcut Checklist

Sketch-focused Photoshop parity checklist.

Mac users: swap `Ctrl` to `Cmd` and `Alt` to `Option`.

Only mark a shortcut as implemented when the behavior really exists in the sketch editor. This file intentionally omits Photoshop shortcuts that are not meaningful here yet, such as type formatting, channels, layer-stack power features, and desktop file-management actions like `Save As` / `Save for Web`.

## Must-Know

- [x] `Ctrl+Z` undo
- [ ] `Ctrl+Shift+Z` / `Ctrl+Y` redo
- [x] `Ctrl+S` export PNG
- [x] `D` restore default colors (black / white)
- [x] `X` swap foreground / background colors
- [x] `Space+drag` temporary hand tool / pan from any tool
- [ ] `Alt+click` temporary eyedropper while painting - does not work reliably yet; should also show explicit eyedropper feedback while held
- [x] `[` / `]` decrease / increase brush size
- [x] `Shift+[` / `Shift+]` decrease / increase brush hardness
- [x] `0-9` set tool opacity (`0` = 100%, `1` = 10%, etc.) - works already; add better tooltip/discoverability on the opacity slider
- [x] `Ctrl+0` fit / reset view
- [x] `Ctrl+1` actual pixels (100%)
- [x] `Tab` show / hide panels

## Toolbar Shortcuts

- [x] `V` move tool
- [x] `B` brush tool
- [x] `P` pencil tool
- [x] `E` eraser tool
- [x] `G` fill tool
- [x] `I` eyedropper tool
- [x] `Q` blur tool
- [x] `S` clone stamp tool
- [x] `T` gradient tool
- [x] `C` crop tool
- [x] `L` line tool
- [x] `R` rectangle tool
- [x] `O` ellipse tool
- [x] `A` arrow tool
- [ ] `M` rectangular marquee tool
- [ ] `W` object selection / magic wand
- [ ] `J` healing / spot heal
- [ ] `U` rectangle/shape group tool
- [ ] `Z` zoom tool
- [ ] `H` hand tool
- [ ] `K` frame tool

## Selection

- [x] `Ctrl+A` select all
- [x] `Ctrl+D` deselect
- [ ] `Ctrl+Shift+I` invert selection - current implementation is not correct because selection is not pixel-based yet
- [x] `Ctrl+Shift+D` restore last selection
- [ ] `Shift+drag` add to selection - current implementation is not correct because selection is not pixel-based yet
- [ ] `Alt+drag` subtract from selection - currently behaves incorrectly
- [ ] `Shift+Alt+drag` intersect with selection
- [ ] `Arrow` keys move selection by 1 px
- [ ] `Shift+Arrow` keys move selection by 10 px
- [x] `Space` move marquee while drawing selection
- [ ] `L` lasso tool
- [ ] `W` magic wand / quick select
- [ ] `Shift+F6` feather selection
- [ ] `Alt+S` select subject

## Move & Transform

- [x] `Arrow` keys nudge active layer by 1 px
- [x] `Shift+Arrow` keys nudge active layer by 10 px
- [x] `Esc` cancel active selection / crop / transform-like interaction
- [x] `Alt+click` (move tool) auto-pick topmost layer with non-transparent pixels under cursor
- [ ] `Shift+drag` constrain line / square / circle drawing - currently broken in practice
- [ ] `Ctrl+T` free transform
- [ ] `Enter` commit transform
- [ ] `Ctrl+Shift+T` repeat last transform
- [x] hold `Ctrl` / `Cmd` (Mac) to temporarily switch to move tool; release to restore the previous tool
- [ ] `Ctrl+Alt+Arrow` move duplicate of selection by 1 px
- [ ] `Ctrl+Alt+Shift+Arrow` move duplicate of selection by 10 px

## Painting & Fill

- [x] `Shift+click` straight line from last stroke endpoint
- [x] `Alt+Backspace` fill with foreground color
- [x] `Ctrl+Backspace` fill with background color
- [ ] `Shift+Backspace` / `Shift+F5` open fill dialog
- [ ] `Ctrl+Shift+Backspace` fill while preserving transparency
- [ ] `Shift+0-9` set brush flow
- [ ] `~` temporarily erase with current brush
- [ ] `Caps Lock` cross-hair cursor
- [ ] `/` toggle lock transparent pixels

## Clipboard & Import

- [x] `Ctrl+C` copy selection / layer
- [x] `Ctrl+X` cut selection / layer
- [x] `Ctrl+V` paste from internal or system clipboard (supports images from outside apps)
- [x] Drag-and-drop image file onto canvas imports into active layer

## View & Navigation

- [x] `+` / `-` zoom in / out
- [ ] `Shift+Tab` hide panels but keep canvas view chrome
- [ ] `F` cycle screen modes
- [ ] `Ctrl+H` hide extras / overlays
- [ ] `Ctrl+;` show / hide guides
- [ ] `Home` move view to upper-left corner
- [ ] `End` move view to lower-right corner
- [ ] `Page Up` / `Page Down` scroll by one screen

## Notes

- Brush-size, hardness, opacity, eyedropper, and pan shortcuts are the highest-value Photoshop behaviors and should remain reliable across tool changes.
- Keep the shortcut meaning accurate. Example: `D` is default colors, while `Ctrl+D` is deselect.
- Inline reality notes are intentional here. If a shortcut exists but is broken, flaky, or only partially correct, keep that note instead of silently marking it done.
