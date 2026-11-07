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
    readonly property color rerouteBorder: dark ? "#808590" : "#71717a"
    readonly property color overlay: dark ? "#17181b" : "#f2f2f4"
    readonly property color divider: dark ? "#14ffffff" : "#e4e4e7"
    readonly property color field: dark ? "#08ffffff" : "#062a2a2a"
    readonly property color fieldFocus: dark ? "#0dffffff" : "#121c1c1c"
    readonly property color fieldDisabled: dark ? "#1affffff" : "#141a1a1a"
    readonly property color shadow: dark ? "#4d000000" : "#22000000"
    readonly property color checker: dark ? "#06ffffff" : "#061a1a1a"
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
