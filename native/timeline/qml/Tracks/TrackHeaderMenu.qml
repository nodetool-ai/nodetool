pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline

Menu {
    id: menu
    required property TimelineModel timeline
    property string trackId: ""
    property string trackName: ""
    property string trackType: "video"
    readonly property string typeLabel: trackType === "midi" ? "MIDI" : trackType === "chord" ? "chords"
                                       : trackType === "subtitle" ? "text" : trackType
    signal renameRequested(string trackId)
    objectName: "trackHeaderMenu"
    width: Math.max(180, insertAbove.implicitWidth + 2 * Theme.spacingXs)
    padding: Theme.spacingXs
    popupType: Popup.Item

    function openFor(id, name, type, px, py) {
        trackId = id
        trackName = name
        trackType = type
        popup(px, py)
    }
    background: Rectangle { color: Theme.backgroundPaper; radius: Theme.radiusLg; border.color: Theme.divider }
    component HeaderMenuItem: MenuItem {
        id: entry
        property bool destructive: false
        property string iconPath
        height: Theme.rulerHeight
        leftPadding: Theme.spacingMd
        rightPadding: Theme.spacingMd
        contentItem: Row {
            spacing: Theme.spacingMd
            Icon {
                anchors.verticalCenter: parent.verticalCenter
                path: entry.iconPath
                size: Theme.iconSm
                color: entry.destructive ? Theme.error : Theme.textSecondary
            }
            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: entry.text
                color: entry.destructive ? Theme.error : Theme.textPrimary
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmall
            }
        }
        background: Rectangle { color: entry.highlighted ? Theme.actionHover : "transparent"; radius: Theme.radiusSm }
    }
    HeaderMenuItem {
        objectName: "trackMenu-rename"
        text: "Rename"
        iconPath: "M18.41 5.8 17.2 4.59c-.78-.78-2.05-.78-2.83 0l-2.68 2.68L3 15.96V20h4.04l8.74-8.74 2.63-2.63c.79-.78.79-2.05 0-2.83M6.21 18H5v-1.21l8.66-8.66 1.21 1.21zM11 20l4-4h6v4z"
        onTriggered: menu.renameRequested(menu.trackId)
    }
    HeaderMenuItem {
        objectName: "trackMenu-duplicate"
        text: "Duplicate track"
        iconPath: "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z"
        onTriggered: menu.timeline.applyEdit("duplicateTrack", { trackId: menu.trackId })
    }
    HeaderMenuItem {
        id: insertAbove
        objectName: "trackMenu-insertAbove"
        text: "Insert " + menu.typeLabel + " track above"
        iconPath: "M8 11h3v10h2V11h3l-4-4zM4 3v2h16V3z"
        onTriggered: menu.timeline.applyEdit("insertTrack", {
            type: menu.trackType, atIndex: TrackHeaderActions.position(menu.timeline, menu.trackId) })
    }
    HeaderMenuItem {
        objectName: "trackMenu-insertBelow"
        text: "Insert " + menu.typeLabel + " track below"
        iconPath: "M16 13h-3V3h-2v10H8l4 4zM4 19v2h16v-2z"
        onTriggered: menu.timeline.applyEdit("insertTrack", {
            type: menu.trackType, atIndex: TrackHeaderActions.position(menu.timeline, menu.trackId) + 1 })
    }
    MenuSeparator {
        objectName: "trackMenu-deleteDivider"
        contentItem: Rectangle { implicitHeight: 1; color: Theme.divider }
    }
    HeaderMenuItem {
        objectName: "trackMenu-remove"
        text: "Delete track"
        iconPath: Icons.deleteOutline
        destructive: true
        onTriggered: confirm.open()
    }

    Dialog {
        id: confirm
        objectName: "deleteTrackDialog"
        parent: Overlay.overlay
        anchors.centerIn: parent
        width: 400
        modal: true
        title: "Delete track?"
        padding: Theme.spacingXl
        popupType: Popup.Item
        background: Rectangle { color: Theme.backgroundPaper; radius: Theme.radiusLg; border.color: Theme.divider }
        header: Text {
            text: confirm.title
            color: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeNormal
            font.weight: Font.DemiBold
            padding: Theme.spacingXl
        }
        contentItem: Text {
            objectName: "deleteTrackContent"
            text: "Track \"" + menu.trackName + "\" and all its clips are deleted."
            color: Theme.textSecondary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            wrapMode: Text.WordWrap
        }
        footer: Item {
            implicitHeight: confirmButtons.implicitHeight + 2 * Theme.spacingXl
            Row {
                id: confirmButtons
                anchors.right: parent.right
                anchors.rightMargin: Theme.spacingXl
                y: Theme.spacingXl
                layoutDirection: Qt.RightToLeft
                spacing: Theme.spacingMd
                ToolButton {
                    objectName: "confirmDeleteTrack"
                    label: "Delete"
                    iconPath: Icons.deleteOutline
                    onClicked: {
                        confirm.close()
                        if (!menu.timeline.applyEdit("removeTrack", { trackId: menu.trackId })) {
                            warning.open()
                        }
                    }
                }
                ToolButton {
                    objectName: "cancelDeleteTrack"
                    label: "Cancel"
                    iconPath: Icons.close
                    onClicked: confirm.close()
                }
            }
        }
    }
    Popup {
        id: warning
        parent: Overlay.overlay
        anchors.centerIn: parent
        width: 400
        padding: Theme.spacingXl
        modal: true
        focus: true
        popupType: Popup.Item
        background: Rectangle { color: Theme.backgroundPaper; border.color: Theme.warning; radius: Theme.radiusMd }
        contentItem: Text {
            objectName: "trackDeleteWarning"
            text: "Unlock track \"" + menu.trackName + "\" and its clips to delete it"
            color: Theme.warning
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            wrapMode: Text.WordWrap
            Accessible.role: Accessible.AlertMessage
        }
    }
}
