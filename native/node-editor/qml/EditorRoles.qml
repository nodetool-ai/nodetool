import QtQuick
import NodeTool.UiPrimitives as Ui

// Web editor colors that the shared native palette flattens or does not define.
// Values come from web/src/components/themes and the visual comparison capture.
QtObject {
    // web/src/constants/nodeTypes.ts: SUBGRAPH_ACCENT_COLOR
    readonly property color subgraphAccent: "#7c3aed"
    readonly property bool dark: Ui.Theme.dark
    readonly property color canvas: dark ? "#08090a" : "#f6f6f8"
    readonly property color grid: dark ? "#1f2126" : "#d9d9df"
    readonly property color node: dark ? "#0d0e10" : "#ffffff"
    readonly property color chrome: dark ? "#08090a" : "#f5f5f6"
    readonly property color panel: Ui.Theme.surfacePanel
    readonly property color paper: dark ? "#101113" : "#fafafb"
    readonly property color reroutePaper: dark ? "#101113" : "#ffffff"
    // web themes c_node_header_bg_group: the edge of a card inside a group (selectionStyles.ts).
    readonly property color groupHeader: dark ? "#2a2d33" : "#f5f5f6"
    // BaseNode.tsx parentColor: #222 (dark) or #ccc (light) at GROUP_COLOR_OPACITY 0.55.
    readonly property color groupFill: dark ? "#8c222222" : "#8ccccccc"
    // selectionStyles.ts: the selected edge of a Preview card (grey 100) and of an Output card
    // (info.main at 82 percent over white).
    readonly property color previewSelected: dark ? "#d4d6db" : "#27272a"
    readonly property color outputSelected: dark ? "#4adbf1" : "#398da4"
    // palette grey[200], the card title color while zoomed out (nodes.zoomed.css).
    readonly property color zoomedTitle: dark ? "#b4b7bd" : "#3f3f46"
    readonly property color rerouteBorder: dark ? "#808590" : "#71717a"
    readonly property color overlay: dark ? "#17181b" : "#f2f2f4"
    readonly property color divider: dark ? "#14ffffff" : "#e4e4e7"
    readonly property color field: dark ? "#08ffffff" : "#062a2a2a"
    readonly property color fieldFocus: dark ? "#0dffffff" : "#121c1c1c"
    readonly property color fieldDisabled: dark ? "#1affffff" : "#141a1a1a"
    readonly property color shadow: dark ? "#4d000000" : "#22000000"
    readonly property color checker: dark ? "#06ffffff" : "#061a1a1a"
    // web/src/styles/AlphaSurface.ts: alphaSurfaceBg, fixed dark in both schemes.
    readonly property color alphaBase: "#1e1e1e"
    readonly property color alphaChecker: "#2a2a2a"
    // web themes c_scrim and grey 100: the image dimensions badge and the media asset actions.
    readonly property color mediaScrim: "#99000000"
    readonly property color mediaScrimInk: dark ? "#d4d6db" : "#27272a"
    // web themes c_scrim_strong: the backdrop of a video on a card (special_nodes.css).
    readonly property color mediaScrimStrong: "#d9000000"
    // web/src/components/widgets/ImageComparer.tsx: metadata is white at 80 percent over the scrim.
    readonly property color comparisonMetadataInk: "#ccffffff"
    // web/src/components/widgets/ImageComparer.tsx: minHeight 200px.
    readonly property real comparisonMinimumHeight: 200 * Ui.Theme.uiScale
    readonly property color outline: dark ? "#803e68a7" : "#803062c3"
    readonly property color disabledInk: dark ? "#4dffffff" : "#4d17171a"
    readonly property color disabledOutline: dark ? "#1affffff" : "#141a1a1a"
    readonly property real railWidth: 50
    readonly property real tabHeight: 40
    // web/src/components/workspace/WorkspaceTabBar.tsx and WorkspaceTabItem.tsx
    readonly property real tabMinWidth: 120 * Ui.Theme.uiScale
    readonly property real tabMaxWidth: 220 * Ui.Theme.uiScale
    readonly property int tabTitleTooltipDelay: 150
    // web/src/components/projects/projectIdentity.ts: info.light
    readonly property color projectAccent: dark ? "#67e8f9" : "#22a5c4"
    readonly property real statusHeight: 32
    // web/src/components/ui_primitives/DocumentBar.tsx: DOCUMENT_BAR_HEIGHT
    readonly property real headerHeight: 40 * Ui.Theme.uiScale
}
