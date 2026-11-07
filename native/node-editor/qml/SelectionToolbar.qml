import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// A single selected card gets the web node toolbar (NodeToolButtons.tsx): Run,
// Disable, Duplicate, Chat and More, floating above the card. A selected group,
// comment or reroute and a multi-selection keep the canvas toolbar.
Ui.Surface {
    id: root
    variant: Ui.Surface.Overlay
    readonly property bool cardMode: editor && editor.selectedCount === 1 && editor.selectionInfo.kind === "node"
    implicitWidth: layout.implicitWidth + Ui.Metrics.sm * 2
    implicitHeight: layout.implicitHeight + Ui.Metrics.sm * 2
    component Action: Ui.ToolbarIconButton {
        property string command
        property bool custom: false
        objectName: "selection-" + command.toLowerCase().split(" ").join("-")
        accessibleName: command
        enabled: editor && !editor.readOnly
        onClicked: if (!custom) editor.action(command)
    }
    Loader {
        id: layout
        anchors.centerIn: parent
        sourceComponent: root.cardMode ? cardRow : selectionRow
    }
    Component {
        id: cardRow
        RowLayout {
            spacing: Ui.Metrics.xs
            Action {
                command: "Run selected"
                iconName: "playArrow"
                variant: Ui.EditorButton.Primary
                // useRunFromHere.ts: Run node is its own job, so a running workflow does not disable it.
                enabled: editor && !editor.readOnly && !editor.selectionDisabled
            }
            Ui.Separator { orientation: Qt.Vertical; Layout.preferredHeight: Ui.Metrics.lg }
            Action { command: "Open child"; iconName: "layers"; visible: editor && editor.selectionInfo.childGraph === true }
            Action {
                command: editor && editor.selectionMostlyDisabled ? "Enable selected" : "Disable selected"
                iconName: "powerSettingsNew"
                active: editor && editor.selectionMostlyDisabled
            }
            Action { command: "Duplicate"; iconName: "copy" }
            Action { command: "Chat about node"; iconName: "forumOutlined"; enabled: true }
            Action {
                command: "More node actions"
                iconName: "moreVert"
                enabled: true
                custom: true
                onClicked: editor.showNodeMenu(mapToGlobal(0, height))
            }
        }
    }
    Component {
        id: selectionRow
        RowLayout {
            spacing: Ui.Metrics.xs
            Action { command: "Arrange selection"; iconName: "alignHorizontalLeft"; enabled: editor && !editor.readOnly && editor.selectedCount >= 2 }
            Ui.Separator { orientation: Qt.Vertical; Layout.preferredHeight: Ui.Metrics.lg }
            Action { command: "Run selected"; iconName: "playArrow"; enabled: editor && !editor.readOnly && !editor.runActive && !editor.selectionDisabled }
            Action { command: "Open child"; iconName: "layers"; visible: editor && editor.selectedCount === 1 && editor.selectionInfo.childGraph === true }
            Action { command: "Duplicate"; iconName: "copy" }
            Action { command: "Group selection"; iconName: "layers"; enabled: editor && !editor.readOnly && editor.selectedCount >= 2 }
            Action { command: "Link selected"; iconName: "link"; enabled: editor && !editor.readOnly && editor.selectedCount === 2 }
            Action { command: editor && editor.selectionMostlyDisabled ? "Enable selected" : "Disable selected"; iconName: "powerSettingsNew" }
            Ui.Separator { orientation: Qt.Vertical; Layout.preferredHeight: Ui.Metrics.lg }
            Action { command: "Delete"; iconName: "deleteOutline" }
        }
    }
}
