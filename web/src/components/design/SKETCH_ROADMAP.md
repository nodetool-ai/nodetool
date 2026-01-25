# Canvas Editor - Sketch Compatibility Roadmap

This document outlines the roadmap for implementing Sketch file format compatibility, organized by feature importance.

## Phase 1: Core File Format (✅ COMPLETED)

Essential features for basic Sketch file compatibility.

### 1.1 File I/O
- [x] Read .sketch files (ZIP archive parsing)
- [x] Parse document.json, meta.json, user.json
- [x] Parse pages from pages/ folder
- [x] Extract images from images/ folder
- [x] Write .sketch files with proper structure
- [x] Generate valid meta.json and user.json

### 1.2 Basic Layer Types
- [x] Rectangle layers
- [x] Text layers  
- [x] Group layers
- [x] Bitmap/Image layers
- [x] Oval to rectangle conversion (with border-radius)

### 1.3 Basic Styling
- [x] Fill colors (solid)
- [x] Border/stroke colors
- [x] Border width
- [x] Border radius
- [x] Opacity
- [x] Layer visibility and lock state

## Phase 2: Enhanced Layer Support (PRIORITY: HIGH)

Essential for professional design workflows.

### 2.1 Additional Shape Types
- [ ] Ellipse/Oval (native - not converted to rectangle)
- [ ] Line tool
- [ ] Polygon shapes
- [ ] Star shapes
- [ ] Triangle shapes

### 2.2 Vector Path Support
- [ ] Basic path parsing (ShapePath)
- [ ] CurvePoint interpretation
- [ ] Bezier curve rendering
- [ ] Pen tool for path creation
- [ ] Path editing (node manipulation)

### 2.3 Boolean Operations
- [ ] Union
- [ ] Subtract
- [ ] Intersect
- [ ] Difference

## Phase 3: Advanced Styling (PRIORITY: MEDIUM-HIGH)

Features needed for full design fidelity.

### 3.1 Gradient Support
- [ ] Linear gradients
- [ ] Radial gradients
- [ ] Angular gradients
- [ ] Multi-stop gradients
- [ ] Gradient editing UI

### 3.2 Effects
- [ ] Drop shadows
- [ ] Inner shadows
- [ ] Gaussian blur
- [ ] Background blur
- [ ] Multiple shadow layers

### 3.3 Border Options
- [ ] Dash patterns
- [ ] Line cap styles (butt, round, projecting)
- [ ] Line join styles (miter, round, bevel)
- [ ] Border position (inside, center, outside)

### 3.4 Pattern Fills
- [ ] Image pattern fills
- [ ] Tile patterns
- [ ] Stretch patterns

## Phase 4: Document Organization (PRIORITY: MEDIUM)

Features for managing complex documents.

### 4.1 Multiple Pages
- [ ] Page creation/deletion
- [ ] Page navigation
- [ ] Page reordering
- [ ] Page list panel

### 4.2 Artboard Management
- [ ] Create artboards
- [ ] Resize artboards
- [ ] Artboard presets (device sizes)
- [ ] Artboard backgrounds
- [ ] Export artboards individually

### 4.3 Layer Organization
- [ ] Nested groups
- [ ] Group expansion/collapse in layer panel
- [ ] Layer search/filter
- [ ] Smart guides and snapping

## Phase 5: Components & Styles (PRIORITY: MEDIUM-LOW)

Features for design systems.

### 5.1 Symbols/Components
- [ ] Symbol source (master) creation
- [ ] Symbol instances
- [ ] Override properties
- [ ] Detach from symbol

### 5.2 Shared Styles
- [ ] Layer styles library
- [ ] Text styles library
- [ ] Color swatches/palette
- [ ] Style application and sync

## Phase 6: Text Enhancements (PRIORITY: LOW)

Advanced text features.

### 6.1 Rich Text
- [ ] Multiple text styles in one layer
- [ ] Text transforms (uppercase, lowercase)
- [ ] Underline and strikethrough
- [ ] Letter spacing (kerning)
- [ ] Paragraph spacing

### 6.2 Text Layout
- [ ] Auto-height text boxes
- [ ] Fixed-height with overflow
- [ ] Text on path
- [ ] Vertical text

## Phase 7: Export & Integration (PRIORITY: LOW)

Additional export capabilities.

### 7.1 Asset Export
- [ ] PNG export with scale options
- [ ] SVG export
- [ ] PDF export
- [ ] WebP export
- [ ] Slice creation

### 7.2 Sketch Integration
- [ ] Foreign symbols (linked libraries)
- [ ] Preserve Sketch-specific data (userInfo)
- [ ] Better version compatibility

## Implementation Notes

### Dependencies Needed
- Path rendering: May need paper.js or similar for complex paths
- SVG export: Could use fabricjs or custom implementation
- PDF export: pdf-lib or similar

### Technical Debt to Address
- Konva.js limitations for some Sketch features
- Performance optimization for large documents
- Memory management for embedded images

### Testing Requirements
- Unit tests for each converter function
- Integration tests with real .sketch files
- Visual regression tests for rendering accuracy
- Performance benchmarks for large files
