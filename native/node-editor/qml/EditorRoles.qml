import QtQuick
import NodeTool.UiPrimitives as Ui

// Web editor colors that the shared native palette flattens or does not define.
// Values come from web/src/components/themes and the visual comparison capture.
QtObject {
    // web/src/constants/nodeTypes.ts: SUBGRAPH_ACCENT_COLOR
    readonly property color subgraphAccent: Ui.Theme.subgraphAccent
    readonly property bool dark: Ui.Theme.dark
    readonly property color canvas: Ui.Theme.graphCanvas
    readonly property color grid: Ui.Theme.graphGrid
    readonly property color node: Ui.Theme.graphNode
    readonly property color chrome: Ui.Theme.surfaceCanvas
    readonly property color panel: Ui.Theme.surfacePanel
    readonly property color paper: Ui.Theme.graphPaper
    readonly property color reroutePaper: Ui.Theme.graphReroutePaper
    // web themes c_node_header_bg_group: the edge of a card inside a group (selectionStyles.ts).
    readonly property color groupHeader: Ui.Theme.graphGroupHeader
    // BaseNode.tsx parentColor: #222 (dark) or #ccc (light) at GROUP_COLOR_OPACITY 0.55.
    readonly property color groupFill: Ui.Theme.graphGroupFill
    // selectionStyles.ts: the selected edge of a Preview card (grey 100) and of an Output card
    // (info.main at 82 percent over white).
    readonly property color previewSelected: Ui.Theme.graphPreviewSelected
    readonly property color outputSelected: Ui.Theme.graphOutputSelected
    // palette grey[200], the card title color while zoomed out (nodes.zoomed.css).
    readonly property color zoomedTitle: Ui.Theme.graphZoomedTitle
    readonly property color rerouteBorder: Ui.Theme.graphRerouteBorder
    readonly property color overlay: Ui.Theme.surfaceOverlay
    readonly property color divider: Ui.Theme.graphDivider
    readonly property color field: Ui.Theme.fieldSurface
    readonly property color fieldFocus: Ui.Theme.fieldSurfaceFocus
    readonly property color fieldDisabled: Ui.Theme.fieldSurfaceDisabled
    readonly property color shadow: Ui.Theme.graphShadow
    readonly property color checker: Ui.Theme.graphChecker
    // web/src/styles/AlphaSurface.ts: alphaSurfaceBg, fixed dark in both schemes.
    readonly property color alphaBase: Ui.Theme.alphaSurfaceBase
    readonly property color alphaChecker: Ui.Theme.alphaSurfaceChecker
    // web themes c_scrim and grey 100: the image dimensions badge and the media asset actions.
    readonly property color mediaScrim: Ui.Theme.scrimMedia
    readonly property color mediaScrimInk: Ui.Theme.mediaScrimInk
    // web themes c_scrim_strong: the backdrop of a video on a card (special_nodes.css).
    readonly property color mediaScrimStrong: Ui.Theme.mediaScrimStrong
    // web/src/components/widgets/ImageComparer.tsx: metadata is white at 80 percent over the scrim.
    readonly property color comparisonMetadataInk: Ui.Theme.comparisonMetadataInk
    // web/src/components/widgets/ImageComparer.tsx: minHeight 200px.
    readonly property color controlWire: Ui.Theme.graphControlWire
    readonly property real comparisonMinimumHeight: 200 * Ui.Theme.uiScale
    readonly property color outline: Ui.Theme.graphOutline
    readonly property color disabledInk: Ui.Theme.graphDisabledInk
    readonly property color disabledOutline: Ui.Theme.fieldSurfaceDisabled
    readonly property real railWidth: 50
    readonly property real tabHeight: 40
    // web/src/components/workspace/WorkspaceTabBar.tsx and WorkspaceTabItem.tsx
    readonly property real tabMinWidth: 120 * Ui.Theme.uiScale
    readonly property real tabMaxWidth: 220 * Ui.Theme.uiScale
    readonly property int tabTitleTooltipDelay: 150
    // web/src/components/projects/projectIdentity.ts: info.light
    readonly property color projectAccent: Ui.Theme.projectAccent
    readonly property real statusHeight: 32
    // web/src/components/ui_primitives/DocumentBar.tsx: DOCUMENT_BAR_HEIGHT
    readonly property real headerHeight: 40 * Ui.Theme.uiScale
}
