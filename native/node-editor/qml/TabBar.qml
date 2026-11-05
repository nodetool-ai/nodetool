import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The web editor's workflow tab strip. Native windows hold one workflow.
Rectangle {
    id: root
    EditorRoles { id: roles }
    color: roles.chrome
    implicitHeight: roles.tabHeight
    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: Ui.Metrics.border; color: roles.divider }
    Item {
        id: tab
        objectName: "workflow-tab"
        height: parent.height
        width: tabRow.implicitWidth + Ui.Metrics.lg * 2
        RowLayout {
            id: tabRow
            anchors.centerIn: parent
            spacing: Ui.Metrics.sm
            Ui.Text { text: editor ? editor.workflowName : ""; role: Ui.Typography.SansLabel; font.weight: Font.Normal; lineHeight: 1 }
            Rectangle {
                objectName: "unsaved-indicator"
                visible: editor && editor.hasUnsavedChanges
                width: Ui.Metrics.sm; height: width; radius: width / 2
                color: Ui.Theme.statusWarning
                Accessible.name: "Unsaved changes"
            }
        }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: Ui.Metrics.focus; color: Ui.Theme.accentPrimary }
        Rectangle { anchors.right: parent.right; width: Ui.Metrics.border; height: parent.height; color: roles.divider }
    }
    Ui.Text {
        objectName: "save-state"
        anchors.right: parent.right
        anchors.rightMargin: Ui.Metrics.lg
        anchors.verticalCenter: parent.verticalCenter
        text: editor ? editor.saveState : ""
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Secondary
        lineHeight: 1
    }
}
