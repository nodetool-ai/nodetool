# Shortcut Checklist

## Photoshop-Style Shortcuts

Mac users: swap `Ctrl` to `Cmd` and `Alt` to `Option`.

Only mark a shortcut as implemented when the actual behavior exists, not just the key binding.

### Selection

- [ ] `M` for marquee tool
- [ ] `L` for lasso tool
- [ ] `W` for magic wand / quick select
- [x] `Ctrl+A` for select all
- [x] `Ctrl+D` for deselect
- [x] `Ctrl+Shift+I` for invert selection
- [x] `Ctrl+Shift+D` for reselect last selection
- [x] `Shift+drag` to add to selection
- [x] `Alt+drag` to subtract from selection
- [ ] `Alt+S` for select subject

### Move & Transform

- [x] `V` for move tool
- [ ] `Ctrl+T` for free transform
- [ ] `Enter` to confirm transform
- [x] `Esc` to cancel active selection / transform-like interactions
- [x] `Shift+drag` shape constraints for line, square, and circle drawing
- [ ] `Ctrl+Shift+T` for repeat last transform
- [x] `Arrow` keys to nudge by 1px
- [x] `Shift+Arrow` keys to nudge by 10px

### Painting & Drawing

- [x] `S` for clone stamp
- [ ] `J` for healing brush / spot heal
- [ ] `Shift+0-9` to set brush flow
- [x] `Alt+click` temporary eyedropper while painting
- [x] `Shift+click` straight line from last stroke end
- [x] `[` / `]` to decrease / increase brush size
- [x] `Shift+[` / `Shift+]` to decrease / increase hardness
- [x] `0-9` to set brush opacity

### Erasing & Filling

- [x] `E` for eraser
- [x] `G` for paint bucket / fill tool
- [x] `Alt+Backspace` to fill with foreground color
- [x] `Ctrl+Backspace` to fill with background color
- [ ] `Shift+F5` for fill dialog
- [ ] `Ctrl+Shift+Backspace` to fill and preserve transparency

### View & Navigation

- [x] `Ctrl++` to zoom in
- [x] `Ctrl+-` to zoom out
- [x] `Ctrl+0` to fit / reset view
- [x] `Tab` to hide / show panels
- [ ] `Z` for zoom tool
- [ ] `H` for hand / pan tool
- [x] `Ctrl+1` for 100% actual pixels
- [x] `Space+drag` to pan from any tool
- [ ] `F` to cycle screen modes
- [ ] `Ctrl+;` to show / hide guides

## Notes

- Brush size/hardness shortcuts should apply consistently to Brush, Eraser, and Clone Stamp.
- `Alt+click` eyedropper and `Space+drag` pan are high-value patterns and should stay reliable across tool changes.
- Keep this file in sync with actual shipped behavior rather than wishlist-only shortcut plans elsewhere.
