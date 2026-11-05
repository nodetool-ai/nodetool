import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Ui.Surface {
    id: root
    variant: Ui.Surface.Overlay
    implicitWidth: row.implicitWidth + Ui.Metrics.sm * 2
    implicitHeight: row.implicitHeight + Ui.Metrics.sm * 2
    component Action: Ui.ToolbarIconButton {
        property string command
        objectName: "selection-" + command.toLowerCase().split(" ").join("-")
        accessibleName: command
        enabled: editor && !editor.readOnly
        onClicked: editor.action(command)
    }
    RowLayout {
        id: row
        anchors.centerIn: parent
        spacing: Ui.Metrics.xs
        Action { command: "Arrange selection"; iconName: "alignHorizontalLeft"; enabled: editor && !editor.readOnly && editor.selectedCount >= 2 }
        Ui.Separator { orientation: Qt.Vertical; Layout.preferredHeight: Ui.Metrics.lg }
        Action { command: "Run selected"; iconName: "playArrow"; enabled: editor && !editor.readOnly && !editor.runActive && !editor.selectionDisabled }
        Action { command: "Duplicate"; iconName: "copy" }
        Action { command: "Group selection"; iconName: "layers"; enabled: editor && !editor.readOnly && editor.selectedCount >= 2 }
        Action { command: "Link selected"; iconName: "link"; enabled: editor && !editor.readOnly && editor.selectedCount === 2 }
        Action { command: editor && editor.selectionDisabled ? "Enable selected" : "Disable selected"; iconName: "powerSettingsNew" }
        Ui.Separator { orientation: Qt.Vertical; Layout.preferredHeight: Ui.Metrics.lg }
        Action { command: "Delete"; iconName: "deleteOutline" }
    }
}
