import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    EditorRoles { id: roles }
    color: roles.chrome
    implicitHeight: roles.tabHeight
    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: Ui.Metrics.border; color: roles.divider }
    Flickable {
        anchors.fill: parent
        contentWidth: tabRow.implicitWidth
        clip: true
        flickableDirection: Flickable.HorizontalFlick
        Row {
            id: tabRow
            height: parent.height
            Repeater {
                model: editor ? editor.workflowTabs : []
                delegate: Item {
                    required property int index
                    required property var modelData
                    objectName: "workflow-tab-" + index
                    height: tabRow.height
                    width: controls.implicitWidth + Ui.Metrics.md * 2
                    RowLayout {
                        id: controls
                        anchors.centerIn: parent
                        spacing: Ui.Metrics.xs
                        Ui.EditorButton {
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                            objectName: "activate-tab-" + index
                            text: modelData.title
                            Accessible.name: modelData.title + (modelData.dirty ? " — Unsaved changes" : "")
                            onClicked: editor.activateTab(index)
                        }
                        Rectangle {
                            objectName: "unsaved-indicator"
                            visible: modelData.dirty
                            width: Ui.Metrics.sm; height: width; radius: width / 2
                            color: Ui.Theme.statusWarning
                            Accessible.name: "Unsaved changes"
                        }
                        Ui.EditorButton {
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                            objectName: "close-tab-" + index
                            text: "×"
                            Accessible.name: "Close " + modelData.title
                            onClicked: editor.closeTab(index)
                        }
                    }
                    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: Ui.Metrics.focus; visible: editor && editor.activeTab === index; color: Ui.Theme.accentPrimary }
                    Rectangle { anchors.right: parent.right; width: Ui.Metrics.border; height: parent.height; color: roles.divider }
                }
            }
            Ui.EditorButton {
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                objectName: "new-workflow-tab"
                anchors.verticalCenter: parent.verticalCenter
                text: "+"
                Accessible.name: "New workflow tab"
                onClicked: editor.newTab()
            }
        }
    }
}
