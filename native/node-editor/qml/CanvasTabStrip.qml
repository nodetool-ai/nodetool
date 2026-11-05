import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Item {
    implicitHeight: (editor ? editor.canvasStrips.length : 0) * Ui.Metrics.compact
    EditorRoles {
        id: roles
    }
    Column {
        id: childRows
        width: parent.width
        Repeater {
            model: editor ? editor.canvasStrips : []
            delegate: Rectangle {
                required property var modelData
                readonly property int depth: modelData.depth
                objectName: "subgraph-strip-" + depth
                width: childRows.width
                height: Ui.Metrics.compact
                color: Ui.Theme.surfaceCanvas
                Rectangle {
                    anchors.bottom: parent.bottom
                    width: parent.width
                    height: Ui.Metrics.border
                    color: Ui.Theme.borderSubtle
                }
                Flickable {
                    anchors.fill: parent
                    contentWidth: childrenRow.width
                    clip: true
                    Row {
                        id: childrenRow
                        height: parent.height
                        Repeater {
                            model: modelData.entries
                            delegate: Rectangle {
                                id: entry
                                required property var modelData
                                required property int index
                                width: entryControls.implicitWidth + Ui.Metrics.md + (modelData.host ? Ui.Metrics.md : Ui.Metrics.xs)
                                height: childrenRow.height - (modelData.selected ? 0 : Ui.Metrics.border)
                                color: modelData.selected ? Ui.Theme.surfacePanel : entryHover.hovered ? Ui.Theme.actionHover : "transparent"
                                activeFocusOnTab: true
                                Accessible.role: Accessible.PageTab
                                Accessible.name: modelData.title
                                Accessible.checkable: true
                                Accessible.checked: modelData.selected
                                Accessible.onPressAction: editor.activateSurface(modelData.surface)
                                Keys.onReturnPressed: editor.activateSurface(modelData.surface)
                                Keys.onSpacePressed: editor.activateSurface(modelData.surface)
                                HoverHandler {
                                    id: entryHover
                                }
                                MouseArea {
                                    objectName: "activate-canvas-" + depth + "-" + entry.index
                                    anchors.fill: parent
                                    onClicked: {
                                        entry.forceActiveFocus();
                                        editor.activateSurface(entry.modelData.surface);
                                    }
                                }
                                RowLayout {
                                    id: entryControls
                                    anchors.left: parent.left
                                    anchors.leftMargin: Ui.Metrics.md
                                    anchors.verticalCenter: parent.verticalCenter
                                    spacing: Ui.Metrics.xs
                                    Ui.Text {
                                        objectName: "canvas-label-" + depth + "-" + entry.index
                                        text: entry.modelData.title
                                        role: Ui.Typography.SansLabel
                                        tone: entry.modelData.selected || entryHover.hovered ? Ui.Text.Primary : Ui.Text.Secondary
                                    }
                                    Ui.CloseButton {
                                        objectName: "close-canvas-" + depth + "-" + entry.index
                                        visible: !entry.modelData.host
                                        implicitWidth: Ui.Metrics.iconSm
                                        implicitHeight: Ui.Metrics.iconSm
                                        iconSize: Ui.Typography.pixelSize(Ui.Typography.SansCaption)
                                        iconTone: hovered ? Ui.Text.Primary : Ui.Text.Secondary
                                        leftPadding: Ui.Metrics.none
                                        rightPadding: Ui.Metrics.none
                                        accessibleName: "Close " + entry.modelData.title
                                        onClicked: editor.closeSurface(entry.modelData.surface)
                                    }
                                }
                                Rectangle {
                                    anchors.right: parent.right
                                    width: Ui.Metrics.border
                                    height: parent.height
                                    color: Ui.Theme.borderSubtle
                                }
                                Rectangle {
                                    objectName: "canvas-selection"
                                    anchors.top: parent.top
                                    width: parent.width
                                    height: Ui.Metrics.focus
                                    visible: entry.modelData.selected
                                    color: entry.modelData.host ? Ui.Theme.accentPrimary : roles.subgraphAccent
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
