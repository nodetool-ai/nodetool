import QtQuick
import QtQuick.Controls as Controls
import QtQuick.Layouts
import NodeTool.Timeline

Item {
    id: root
    objectName: "externalConflictsBanner"
    readonly property var controller: typeof autosave !== "undefined" ? autosave : null
    readonly property var conflicts: controller ? controller.externalConflicts : []
    visible: conflicts.length > 0

    function editorAbove() {
        let item = parent
        while (item) {
            if (item.timeline !== undefined && item.clock !== undefined) {
                return item
            }
            item = item.parent
        }
        return null
    }

    component ConflictAction: Controls.Button {
        id: action
        implicitHeight: InspectorTokens.controlSm
        leftPadding: Theme.spacingMd
        rightPadding: Theme.spacingMd
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
        background: Rectangle {
            radius: Theme.radiusSm
            color: action.hovered || action.activeFocus ? Theme.actionSelected : Theme.backgroundPaper
            border.color: action.activeFocus ? Theme.warning : Theme.divider
        }
        contentItem: Text {
            text: action.text
            font: action.font
            color: action.enabled ? Theme.warningLight : Theme.textDisabled
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }
    }

    // The overlay fills the editor. Only the buttons below take pointer input.
    Rectangle {
        objectName: "externalConflictsWarning"
        anchors.top: parent.top
        width: parent.width
        height: rows.implicitHeight + Theme.spacingLg * 2
        color: Theme.backgroundPaper
        border.color: Theme.warning
        ColumnLayout {
            id: rows
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: Theme.spacingLg
            spacing: Theme.spacingSm
            Text {
                Layout.fillWidth: true
                text: root.conflicts.length === 1
                    ? "1 change made outside the editor conflicts with your edits."
                    : root.conflicts.length + " changes made outside the editor conflict with your edits."
                wrapMode: Text.WordWrap
                color: Theme.warningLight
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeNormal
                font.weight: Font.Medium
            }
            Repeater {
                model: root.conflicts
                RowLayout {
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: Theme.spacingMd
                    Text {
                        Layout.fillWidth: true
                        text: modelData.label + ": " + modelData.reason
                        wrapMode: Text.WordWrap
                        color: Theme.warningLight
                        font.family: Theme.sansFamily
                        font.pixelSize: Theme.fontSizeSmall
                    }
                    ConflictAction {
                        objectName: "acceptExternalConflict-" + modelData.id
                        text: "Accept"
                        onClicked: {
                            const editor = root.editorAbove()
                            if (editor && root.controller) {
                                root.controller.acceptExternalConflict(modelData.id, editor.timeline)
                            }
                        }
                    }
                    ConflictAction {
                        objectName: "discardExternalConflict-" + modelData.id
                        text: "Discard"
                        onClicked: {
                            if (root.controller) {
                                root.controller.discardExternalConflict(modelData.id)
                            }
                        }
                    }
                }
            }
        }
    }
}
