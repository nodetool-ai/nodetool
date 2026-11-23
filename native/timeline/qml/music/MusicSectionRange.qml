// Song-section selection spans every track and leaves the generation target separate.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    required property var track
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    readonly property var range: gestures ? gestures.sectionRange : ({})
    readonly property bool active: range.toMs > range.fromMs
    property var sectionMenu: null
    readonly property double msPerPx: viewState ? viewState.msPerPx : 1

    Rectangle {
        id: band
        visible: root.active
        x: root.active ? root.range.fromMs / root.msPerPx : 0
        width: root.active ? (root.range.toMs - root.range.fromMs) / root.msPerPx : 0
        height: parent.height
        color: TimelineVisuals.rangeFill
        border.color: TimelineVisuals.editBlue
        border.width: Ui.Metrics.border
        Ui.EditorButton {
            objectName: "musicRangeSection-" + (root.track.id || "")
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            anchors.margins: Ui.Metrics.xs
            visible: root.range.trackId === root.track.id
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            iconName: "moreHoriz"
            accessibleName: qsTr("Section edits")
            description: qsTr("Cut, copy or change this time range across all tracks")
            onClicked: {
                if (!root.sectionMenu) root.sectionMenu = sectionMenuComponent.createObject(root)
                root.sectionMenu.popupAt(this, 0, height)
            }
        }
    }
    Component {
        id: sectionMenuComponent
        Ui.ContextMenu {
            popupType: Popup.Item
            Ui.MenuItem {
                text: qsTr("Cut section")
                onTriggered: root.gestures.editMusicSection("cut")
            }
            Ui.MenuItem {
                text: qsTr("Copy section")
                onTriggered: root.gestures.editMusicSection("copy")
            }
            Ui.MenuItem {
                text: qsTr("Paste at playhead")
                enabled: !!root.gestures && root.gestures.hasMusicSectionClipboard
                onTriggered: root.gestures.editMusicSection("paste")
            }
            Ui.MenuItem {
                text: qsTr("Delete section")
                onTriggered: root.gestures.editMusicSection("delete")
            }
            Ui.MenuItem {
                text: qsTr("Insert silence")
                onTriggered: root.gestures.editMusicSection("insert")
            }
            Ui.MenuItem {
                objectName: "musicSectionDuplicate-" + (root.track.id || "")
                text: qsTr("Duplicate section")
                onTriggered: root.gestures.editMusicSection("duplicate")
            }
        }
    }

}
