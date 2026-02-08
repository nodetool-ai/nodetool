# Sketch and Figma Feature Analysis (Panel/Functionality Tree)

This document provides a structured feature inventory for Sketch and Figma. It is organized as hierarchical trees starting from the application level, branching into panels/sections, and listing features and sub-features. Each item includes a description, feature list, priority score, and implementation comments.

Sources referenced include:
- Figma Help Center: [Navigation panel](https://help.figma.com/hc/en-us/articles/360039831974), [Properties panel](https://help.figma.com/hc/en-us/articles/360039832014), [Toolbar & tools](https://help.figma.com/hc/en-us/articles/360041064174), [Actions menu](https://help.figma.com/hc/en-us/articles/23570416033943), [Comments](https://help.figma.com/hc/en-us/articles/360039825314)
- Sketch Docs: [The interface overview](https://www.sketch.com/docs/the-interface/), [Toolbar](https://www.sketch.com/docs/interface-and-settings/the-mac-app-interface/the-toolbar/), [Layer List](https://www.sketch.com/docs/interface-and-settings/the-mac-app-interface/the-layer-list/), [Inspector](https://www.sketch.com/docs/interface-and-settings/the-mac-app-interface/the-inspector/), [Canvas](https://www.sketch.com/docs/interface-and-settings/the-mac-app-interface/the-canvas/), [Command Bar](https://www.sketch.com/docs/interface-and-settings/the-mac-app-interface/the-command-bar/), [Components View](https://www.sketch.com/docs/interface-and-settings/the-mac-app-interface/the-components-view/)

---

## Figma (Design editor + file browser)

- [ ] **Figma Application**
  - **Description:** The core application includes a file browser for managing projects and a design editor for creating and prototyping interfaces. The design editor is organized into a canvas surrounded by navigation, tooling, and property panels for editing and inspection.
  - **Feature List:**
    - File browser for teams/projects/drafts
    - Design editor workspace
    - Dev Mode toggle
    - Collaboration and commenting
  - **Priority Score:** 1
  - **Implementation Comment:** Separate shell routing for file browser vs. editor; persistent global navigation.

  - [ ] **File Browser (Home/Dashboard)**
    - **Description:** The file browser lets users organize work into teams, projects, and files, and access recent or shared documents. It is the starting point for opening, creating, and managing files before entering the editor.
    - **Feature List:**
      - Recent files list
      - Team and project navigation
      - Drafts vs. shared files
      - File creation/import
      - Search and sorting
    - **Priority Score:** 1
    - **Implementation Comment:** Provide list + grid views with metadata; include quick create actions.

  - [ ] **Editor Workspace**
    - **Description:** The design editor houses the canvas and all supporting panels for editing, prototyping, and inspecting. It provides a multi-panel layout with docked sidebars and a central infinite canvas.
    - **Feature List:**
      - Left navigation panel
      - Central canvas
      - Right properties panel
      - Bottom toolbar
      - Mode switcher (Design/Prototype/Dev)
    - **Priority Score:** 1
    - **Implementation Comment:** Use resizable panes and collapsible UI to match Figma’s layout ergonomics.

    - [ ] **Navigation Panel (Left Panel)**
      - **Description:** The left panel provides access to page structure and assets. It contains File and Assets tabs and is the main organizer for layers, pages, and component libraries.
      - **Feature List:**
        - File tab (pages/layers)
        - Assets tab (components/libraries)
        - Collapse/expand layers
        - Panel resize and minimize
      - **Priority Score:** 1
      - **Implementation Comment:** Tree-based layer list with search and collapse state; tabs for pages vs. assets.

      - [ ] **File Tab (Pages/Layers)**
        - **Description:** The File tab displays pages and nested layers, reflecting canvas structure. It supports selecting, renaming, ordering, and managing visibility and locking for layers.
        - **Feature List:**
          - Page list with create/rename/reorder
          - Nested layer tree
          - Layer visibility toggle
          - Layer lock toggle
          - Layer search
          - Collapse layers button
        - **Priority Score:** 1
        - **Implementation Comment:** Maintain layer tree order as z-index; include search + bulk rename operations.

      - [ ] **Assets Tab (Components/Libraries)**
        - **Description:** The Assets tab lists reusable components from the current file and connected libraries. Users can search, filter, and insert components into the canvas.
        - **Feature List:**
          - Component list by file/page/frame
          - Library modal access
          - Search components
          - Grid/List view toggle
          - Drag-to-insert instances
        - **Priority Score:** 2
        - **Implementation Comment:** Support library metadata and local vs. external components in UI.

    - [ ] **Canvas (Design Surface)**
      - **Description:** The infinite canvas is where frames, shapes, and other objects are created and arranged. It supports panning, zooming, selection, snapping, and spatial organization across pages.
      - **Feature List:**
        - Infinite pan/zoom
        - Frame/artboard placement
        - Selection boxes
        - Smart guides and snapping
        - Rulers and guides
        - Grid overlays
      - **Priority Score:** 1
      - **Implementation Comment:** Provide high-performance viewport with snapping rules and zoom controls.

      - [ ] **Viewport Navigation & Zoom Controls**
        - **Description:** Navigation tools allow users to pan and zoom the canvas efficiently. Zoom options include fit, selection focus, and percentage-based zoom.
        - **Feature List:**
          - Pan/hand tool
          - Zoom in/out
          - Zoom to fit/selection
          - Zoom percentage display
        - **Priority Score:** 1
        - **Implementation Comment:** Provide smooth zooming and keyboard shortcuts; keep zoom display in toolbar.

      - [ ] **Rulers, Guides, and Grids**
        - **Description:** Measurement tools help align and space elements precisely. Guides and grids can be toggled for layout alignment.
        - **Feature List:**
          - Rulers (toggle)
          - Guides (drag from rulers)
          - Layout grids
          - Pixel grid for high zoom
        - **Priority Score:** 2
        - **Implementation Comment:** Provide canvas overlay layers with snap points and visibility toggles.

      - [ ] **Selection & Transform Handles**
        - **Description:** Selection frames allow moving, resizing, and transforming objects. Handle affordances reflect object types and nesting.
        - **Feature List:**
          - Bounding boxes
          - Resize handles
          - Rotation handle
          - Multi-select alignment
        - **Priority Score:** 1
        - **Implementation Comment:** Provide consistent handles for all object types; multi-select bounding box.

    - [ ] **Toolbar (Bottom)**
      - **Description:** The toolbar houses creation tools and mode switching. It offers quick access to move, frame, shape, text, comments, and actions.
      - **Feature List:**
        - Move/Hand/Scale tools
        - Frame/Section/Slice tools
        - Shape tools
        - Pen/Pencil
        - Text tool
        - Comment/Annotation tools
        - Actions menu
        - Dev Mode toggle
      - **Priority Score:** 1
      - **Implementation Comment:** Toolbar layout should mirror Figma’s tool grouping and shortcuts.

      - [ ] **Move Tools**
        - **Description:** Move tools allow selecting and repositioning objects on the canvas. Hand mode focuses on navigation without selection.
        - **Feature List:**
          - Move/select
          - Hand/pan
          - Scale tool
        - **Priority Score:** 1
        - **Implementation Comment:** Include transient hand tool via spacebar; scale tool for proportional resizing.

      - [ ] **Region Tools (Frame/Section/Slice)**
        - **Description:** Region tools create containers and export regions. Frames structure layout, sections organize canvas regions, slices define export areas.
        - **Feature List:**
          - Frame tool with presets
          - Section tool
          - Slice tool
        - **Priority Score:** 1
        - **Implementation Comment:** Frame presets should map to device sizes; slice defines export bounding boxes.

      - [ ] **Shape & Vector Tools**
        - **Description:** Shape tools create primitive geometry, while vector tools allow custom paths. These are foundational for UI and illustration work.
        - **Feature List:**
          - Rectangle, ellipse, line, arrow
          - Polygon/star
          - Image placement
          - Pen tool
          - Pencil tool
        - **Priority Score:** 1
        - **Implementation Comment:** Provide path editing and on-canvas point manipulation.

      - [ ] **Text Tool**
        - **Description:** Text creation supports fixed and auto-sizing text boxes. Typography controls appear in the properties panel.
        - **Feature List:**
          - Click-to-create text
          - Drag-to-create text box
          - Inline text editing
        - **Priority Score:** 1
        - **Implementation Comment:** Support text auto-resize modes and rich typography properties.

      - [ ] **Comment & Annotation Tools**
        - **Description:** Commenting enables feedback directly on the canvas. Annotation and measurement tools support handoff.
        - **Feature List:**
          - Comment mode
          - Annotation (full seat)
          - Measurement overlays
        - **Priority Score:** 2
        - **Implementation Comment:** Provide pin-based comments and a side panel for threads.

      - [ ] **Actions Menu**
        - **Description:** Actions provide quick command access, AI tools, and plugin/widget entry. It doubles as command search and productivity hub.
        - **Feature List:**
          - Command search
          - AI actions (rename, generate)
          - Plugin/widget access
          - Asset search
          - Common actions (toggle UI, rulers)
        - **Priority Score:** 2
        - **Implementation Comment:** Provide searchable action list with categories and keyboard shortcut access.

      - [ ] **Mode Switcher (Design/Dev Mode)**
        - **Description:** Mode switching changes UI for design vs. inspection workflows. Dev Mode exposes inspection and handoff features.
        - **Feature List:**
          - Design mode
          - Dev Mode toggle
          - Mode-specific panels
        - **Priority Score:** 2
        - **Implementation Comment:** Gate Dev Mode UI by user role; keep mode state globally.

    - [ ] **Properties Panel (Right Sidebar)**
      - **Description:** The right sidebar exposes design properties, prototype settings, and inspection tools. It adapts based on selection and access level.
      - **Feature List:**
        - Design tab
        - Prototype tab
        - Comment/properties for view-only
        - Export settings
      - **Priority Score:** 1
      - **Implementation Comment:** Render property sections conditionally based on selected layer type.

      - [ ] **Design Tab**
        - **Description:** The Design tab controls visual properties of layers and frames. It includes layout, typography, styling, and export options.
        - **Feature List:**
          - Alignment, position, rotation
          - Size and constraints
          - Auto layout
          - Fill, stroke, effects
          - Typography controls
          - Export settings
        - **Priority Score:** 1
        - **Implementation Comment:** Build modular property sections with consistent control patterns.

      - [ ] **Prototype Tab**
        - **Description:** The Prototype tab defines interactions and flow for prototypes. Users add starting points and transitions between frames.
        - **Feature List:**
          - Flow starting points
          - Interaction triggers
          - Transition animations
          - Scroll behavior
          - Device settings
        - **Priority Score:** 2
        - **Implementation Comment:** Use interaction lists with inline editing and connection handles on canvas.

      - [ ] **Comment/Properties (View-Only)**
        - **Description:** View-only users access comments and inspect properties from the sidebar. It includes export options and basic code snippets.
        - **Feature List:**
          - Comment list and search
          - Layer property inspection
          - Export controls
          - Copy CSS/iOS/Android
        - **Priority Score:** 2
        - **Implementation Comment:** Provide read-only property panels and export configuration.

    - [ ] **Collaboration & Presence**
      - **Description:** Collaboration features allow multiple users to edit and comment in real time. Presence indicators show active collaborators.
      - **Feature List:**
        - Cursor presence
        - Avatar list
        - Comment threads
        - Share link/permissions
      - **Priority Score:** 2
      - **Implementation Comment:** Real-time sync with presence states; permission-aware UI.

---

## Sketch (Mac app interface)

- [ ] **Sketch Application**
  - **Description:** Sketch’s Mac app provides a canvas-centered design environment with a layer list, toolbar, inspector, and supporting panels. It emphasizes a desktop workflow with a contextual toolbar and an inspector for detailed layer editing.
  - **Feature List:**
    - Layer list and pages
    - Toolbar + command bar
    - Canvas
    - Inspector (properties)
    - Components view
    - Collaboration tools
  - **Priority Score:** 1
  - **Implementation Comment:** Desktop-style layout with fixed left/right panes and top toolbar.

  - [ ] **Toolbar (Top)**
    - **Description:** The toolbar offers quick access to tools and contextual actions. It includes view switching, insertion, collaboration, and sharing controls.
    - **Feature List:**
      - Canvas/Components view switch
      - Command Bar access
      - Insert/new layer controls
      - Tools (frame/shape)
      - Notifications/comments
      - View/zoom controls
      - Preview/prototyping
      - Collaborate
      - Share
    - **Priority Score:** 1
    - **Implementation Comment:** Provide contextual button groups and dynamic tool options.

    - [ ] **Command Bar Launcher**
      - **Description:** The command bar is a searchable command palette for actions, insertions, and replacements. It prioritizes frequently used actions.
      - **Feature List:**
        - Launch via shortcut
        - Search actions
        - Insert/replace components
        - Filters and navigation
      - **Priority Score:** 2
      - **Implementation Comment:** Implement omnibox-style command palette with context-aware actions.

    - [ ] **View & Zoom Controls**
      - **Description:** View controls manage zoom, UI visibility, and canvas display options. They support focusing on the design area.
      - **Feature List:**
        - Zoom level
        - Show/hide interface
        - View menus
      - **Priority Score:** 2
      - **Implementation Comment:** Provide zoom presets and a toggle for UI chrome.

    - [ ] **Collaboration & Share Controls**
      - **Description:** Collaboration controls allow saving to workspace, inviting collaborators, and sharing documents. Presence indicators show active users.
      - **Feature List:**
        - Collaboration icon
        - Presence avatars
        - Share link/settings
      - **Priority Score:** 2
      - **Implementation Comment:** Provide share modal and presence avatars linked to live collaboration.

  - [ ] **Layer List (Left Panel)**
    - **Description:** The layer list shows documents, pages, and nested layers. It is the main hierarchy browser and supports selection, visibility, and lock controls.
    - **Feature List:**
      - Document list
      - Pages list
      - Nested layer tree
      - Search layers
      - Expand/collapse
      - Hide/lock toggles
      - Focus mode
    - **Priority Score:** 1
    - **Implementation Comment:** Tree UI with search and toggle controls; keep z-order in sync.

    - [ ] **Documents Section**
      - **Description:** The documents section lists open documents and provides quick switching. It supports creating new documents directly.
      - **Feature List:**
        - Open document list
        - New document action
        - Collapse documents list
      - **Priority Score:** 3
      - **Implementation Comment:** Multi-document tabs or dropdown with quick create.

    - [ ] **Pages Section**
      - **Description:** Pages organize the canvas into separate work areas. Users can create, reorder, and rename pages.
      - **Feature List:**
        - Page list
        - Create/rename/reorder pages
        - Jump between pages
      - **Priority Score:** 1
      - **Implementation Comment:** Page list is fundamental; ensure quick keyboard navigation.

    - [ ] **Layers Section**
      - **Description:** Layers represent frames, groups, and objects on the canvas. The list supports nested structures, naming, and visibility control.
      - **Feature List:**
        - Nested layer hierarchy
        - Rename layers
        - Layer icons per type
        - Hide/lock layers
        - Search
      - **Priority Score:** 1
      - **Implementation Comment:** Visualize layer type with icons; allow inline rename.

    - [ ] **Focus Mode**
      - **Description:** Focus mode filters layers to show only relevant hierarchy for the current selection. It reduces clutter in complex files.
      - **Feature List:**
        - Toggle focus mode
        - Filter by selection context
      - **Priority Score:** 3
      - **Implementation Comment:** Provide quick toggle and display filtered subtree only.

  - [ ] **Canvas (Design Surface)**
    - **Description:** The canvas is an infinite workspace for placing frames and layers. It provides navigation, snapping, and visual aids for layout.
    - **Feature List:**
      - Infinite canvas
      - Pan/zoom
      - Selection boxes
      - Smart guides
      - Frames as containers
      - Minimap navigation
    - **Priority Score:** 1
    - **Implementation Comment:** Include minimap for large documents; maintain high-performance rendering.

    - [ ] **Navigation & Zoom**
      - **Description:** Navigation controls include zoom shortcuts, zoom to selection, and panning. Users can toggle pixel rendering and zoom behaviors.
      - **Feature List:**
        - Zoom in/out
        - Fit/selection focus
        - Pan with spacebar
        - Zoom tool
      - **Priority Score:** 1
      - **Implementation Comment:** Support keyboard shortcuts and zoom percentages.

    - [ ] **Rulers, Guides, and Grids**
      - **Description:** Measurement aids include rulers, guides, and grids for precise alignment. Layout grids help with structured design.
      - **Feature List:**
        - Rulers
        - Guides
        - Square grids
        - Layout grids
        - Pixel grid
      - **Priority Score:** 2
      - **Implementation Comment:** Use overlay layers with toggles; ensure snapping integration.

    - [ ] **Smart Guides & Snapping**
      - **Description:** Smart guides provide alignment and spacing hints during movement and resizing. They snap objects to edges, centers, and distances.
      - **Feature List:**
        - Alignment guides
        - Spacing hints
        - Equal distribution snapping
      - **Priority Score:** 2
      - **Implementation Comment:** Implement snapping engine with visual feedback.

    - [ ] **Minimap**
      - **Description:** The minimap provides a quick overview of the canvas and lets users jump to distant areas. It shows viewport position and object names on hover.
      - **Feature List:**
        - Minimap overlay
        - Click-to-jump navigation
        - Viewport drag
      - **Priority Score:** 3
      - **Implementation Comment:** Show minimap when content extends beyond viewport.

  - [ ] **Inspector (Right Panel)**
    - **Description:** The inspector displays properties for selected layers and tools. It adapts to the current selection and provides design, layout, and export settings.
    - **Feature List:**
      - Alignment options
      - Layer properties (position/size/rotation)
      - Layout/sizing
      - Style controls (fills, borders, shadows)
      - Prototyping controls
      - Export settings
    - **Priority Score:** 1
    - **Implementation Comment:** Modular inspector sections; show/hide based on selection.

    - [ ] **Preview & Prototyping**
      - **Description:** Prototype controls let designers create screen flows and preview interactions. This includes setting targets and animations.
      - **Feature List:**
        - Preview launch
        - Hotspot/target frame
        - Transitions/animations
        - Fixed layers in scroll
      - **Priority Score:** 2
      - **Implementation Comment:** Provide prototype connections and a preview window.

    - [ ] **Alignment Options**
      - **Description:** Alignment tools appear for multi-select to distribute and align layers. They accelerate layout adjustments.
      - **Feature List:**
        - Align left/center/right
        - Distribute spacing
        - Align top/middle/bottom
      - **Priority Score:** 2
      - **Implementation Comment:** Provide alignment toolbar integrated into inspector.

    - [ ] **Layer Properties**
      - **Description:** Layer properties include position, rotation, and orientation controls. They allow precise numeric adjustments.
      - **Feature List:**
        - X/Y position
        - Width/height
        - Rotation
        - Flip horizontal/vertical
      - **Priority Score:** 1
      - **Implementation Comment:** Numeric inputs with keyboard nudge support.

    - [ ] **Layout & Sizing**
      - **Description:** Layout controls manage how frames and layers size and respond to changes. This includes resizing behavior and constraints.
      - **Feature List:**
        - Fixed sizing
        - Resizing behavior
        - Constraints
      - **Priority Score:** 2
      - **Implementation Comment:** Provide constraint toggles and responsive layout settings.

    - [ ] **Style Section**
      - **Description:** The style section controls fills, borders, shadows, and effects. It also supports shared styles.
      - **Feature List:**
        - Fill color/gradient
        - Borders and stroke
        - Shadows and blur
        - Opacity
        - Layer styles
      - **Priority Score:** 1
      - **Implementation Comment:** Use layered style stack with toggles.

    - [ ] **Export Section**
      - **Description:** Export controls let users configure asset exports with presets. Multiple export sizes and formats are supported.
      - **Feature List:**
        - Export presets
        - Format selection
        - Batch export
      - **Priority Score:** 2
      - **Implementation Comment:** Provide export list with add/remove presets.

  - [ ] **Components View (Library Manager)**
    - **Description:** Components view shows local symbols, styles, variables, and templates. It is used to manage and insert reusable assets.
    - **Feature List:**
      - Symbols
      - Text styles
      - Layer styles
      - Color variables
      - Frame templates
      - Graphic templates
      - Search and filter
    - **Priority Score:** 2
    - **Implementation Comment:** Provide component gallery with search and type filters.

    - [ ] **Component Filters**
      - **Description:** Filters allow switching between different component categories. Keyboard shortcuts enable quick toggling.
      - **Feature List:**
        - Symbols filter
        - Text styles filter
        - Layer styles filter
        - Color variables filter
        - Templates filter
      - **Priority Score:** 3
      - **Implementation Comment:** Use tabbed filters with hotkeys for quick switching.

    - [ ] **Component Actions**
      - **Description:** Context menus allow duplicating, inserting, renaming, grouping, or deleting components. Inspector integration edits component metadata.
      - **Feature List:**
        - Insert component
        - Duplicate
        - Rename
        - Group/ungroup
        - Delete
        - Copy CSS
      - **Priority Score:** 3
      - **Implementation Comment:** Provide contextual menu per component tile.

  - [ ] **Comments & Collaboration**
    - **Description:** Sketch supports real-time collaboration with presence indicators and sharing controls. Comments can be added via pins for feedback.
    - **Feature List:**
      - Presence avatars
      - Comment pins
      - Share links/permissions
      - Follow mode
    - **Priority Score:** 2
    - **Implementation Comment:** Real-time cursor/presence with optional follow mode is a value add but not essential.
