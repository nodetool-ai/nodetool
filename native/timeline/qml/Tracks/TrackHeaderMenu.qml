pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.ContextMenu {
    id: menu
    required property TimelineModel timeline
    property string trackId: ""
    property string trackName: ""
    property string trackType: "video"
    readonly property string typeLabel: trackType === "midi" ? "MIDI" : trackType === "chord" ? "chords"
                                       : trackType === "subtitle" ? "text" : trackType
    signal renameRequested(string trackId)
    objectName: "trackHeaderMenu"
    popupType: Popup.Item

    function openFor(id, name, type, px, py) {
        trackId = id
        trackName = name
        trackType = type
        popup(px, py)
    }
    component HeaderMenuItem: Ui.MenuItem {
        id: entry
        property bool destructive: false
        iconTone: destructive ? Ui.Text.Error : Ui.Text.Secondary
        textTone: destructive ? Ui.Text.Error : Ui.Text.Primary
    }
    HeaderMenuItem {
        objectName: "trackMenu-rename"
        text: "Rename"
        iconName: "rename"
        onTriggered: menu.renameRequested(menu.trackId)
    }
    HeaderMenuItem {
        objectName: "trackMenu-duplicate"
        text: "Duplicate track"
        iconName: "duplicate"
        onTriggered: menu.timeline.applyEdit("duplicateTrack", { trackId: menu.trackId })
    }
    HeaderMenuItem {
        id: insertAbove
        objectName: "trackMenu-insertAbove"
        text: "Insert " + menu.typeLabel + " track above"
        iconName: "insertAbove"
        onTriggered: menu.timeline.applyEdit("insertTrack", {
            type: menu.trackType, atIndex: TrackHeaderActions.position(menu.timeline, menu.trackId) })
    }
    HeaderMenuItem {
        objectName: "trackMenu-insertBelow"
        text: "Insert " + menu.typeLabel + " track below"
        iconName: "insertBelow"
        onTriggered: menu.timeline.applyEdit("insertTrack", {
            type: menu.trackType, atIndex: TrackHeaderActions.position(menu.timeline, menu.trackId) + 1 })
    }
    MenuSeparator {
        objectName: "trackMenu-deleteDivider"
        contentItem: Ui.Separator {}
    }
    HeaderMenuItem {
        objectName: "trackMenu-remove"
        text: "Delete track"
        iconName: "deleteOutline"
        destructive: true
        onTriggered: confirm.open()
    }

    Ui.Dialog {
        id: confirm
        objectName: "deleteTrackDialog"
        width: parent ? Math.min(Ui.Metrics.dialogCompactWidth, parent.width - 2 * Ui.Metrics.dialogNarrowInset) : Ui.Metrics.dialogCompactWidth
        title: "Delete track?"
        contentItem: Ui.Text {
            objectName: "deleteTrackContent"
            text: "Track \"" + menu.trackName + "\" and all its clips are deleted."
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
            wrapMode: Text.WordWrap
        }
        footer: Item {
            width: confirm.availableWidth
            implicitHeight: confirmButtons.implicitHeight + Ui.Metrics.xl
            Row {
                id: confirmButtons
                anchors.right: parent.right
                anchors.rightMargin: Ui.Metrics.xl
                spacing: Ui.Metrics.md
                Ui.EditorButton {
                    objectName: "cancelDeleteTrack"
                    text: "Cancel"
                    iconName: "close"
                    onClicked: confirm.close()
                }
                Ui.EditorButton {
                    objectName: "confirmDeleteTrack"
                    text: "Delete"
                    iconName: "deleteOutline"
                    variant: Ui.EditorButton.Destructive
                    onClicked: {
                        confirm.close()
                        if (!menu.timeline.applyEdit("removeTrack", { trackId: menu.trackId })) {
                            warning.open()
                        }
                    }
                }
            }
        }
    }
    Ui.Dialog {
        id: warning
        width: parent ? Math.min(Ui.Metrics.dialogCompactWidth, parent.width - 2 * Ui.Metrics.dialogNarrowInset) : Ui.Metrics.dialogCompactWidth
        title: "Track is locked"
        contentItem: Ui.Text {
            objectName: "trackDeleteWarning"
            text: "Unlock track \"" + menu.trackName + "\" and its clips to delete it"
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Warning
            wrapMode: Text.WordWrap
            Accessible.role: Accessible.AlertMessage
        }
        footer: Ui.EditorButton {
            text: "OK"
            onClicked: warning.close()
        }
    }
}
