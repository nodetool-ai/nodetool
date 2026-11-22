// nt-panel: slot=markerRow id=markerLane order=10 title="Marker lane"
// Logic Pro's Marker track, in the Music layout only (the rule the music
// toolbar uses). One row between the ruler and the first track row. The header
// part sits under the TRACKS column: the label and a "+" that adds a marker at
// the playhead through the add-marker action. The lane part sits under the
// ruler and scrolls with the track lanes (same offset and zoom): one block per
// document marker, from its time to its duration, the next marker or the
// sequence end (MarkerLaneLayout.js). A click selects the marker and seeks to
// it, a double-click opens the Edit Marker dialog, a drag moves it, snapped to
// the grid unless Alt is held or Snap is off, in one undo step.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../music/MusicLayout.js" as MusicLayout
import "MarkerLaneLayout.js" as Layout

Item {
    id: root
    objectName: "markerLane"
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    property var clock: null
    // The width of the TRACKS column.
    property real headerWidth: 0
    property var editor: null
    readonly property bool shown: !!editor && !!editor.dockStore && editor.dockStore.workspace === "Music" && sequence.isMusic
    readonly property real rowHeight: Ui.Metrics.iconMd + Ui.Metrics.xs
    readonly property var blocks: shown && timeline ? Layout.extents(timeline.markers, timeline.contentEndMs) : []
    visible: shown
    implicitHeight: shown ? rowHeight : 0

    function attach() { editor = MusicLayout.editorOf(root) }
    Component.onCompleted: attach()
    Timer {
        interval: 50
        repeat: true
        running: !root.editor
        onTriggered: root.attach()
    }
    MusicSequenceState {
        id: sequence
        timeline: root.timeline
    }

    // Header part.
    Rectangle {
        id: header
        objectName: "markerLaneHeader"
        width: root.headerWidth
        height: root.height
        color: Ui.Theme.surfacePanel
        Ui.Text {
            x: Ui.Metrics.lg
            anchors.verticalCenter: parent.verticalCenter
            text: qsTr("Marker")
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
        }
        Ui.ToolbarIconButton {
            id: addButton
            objectName: "markerAddButton"
            anchors.right: parent.right
            anchors.rightMargin: Ui.Metrics.sm
            anchors.verticalCenter: parent.verticalCenter
            width: root.rowHeight - Ui.Metrics.micro
            height: width
            iconName: "add"
            accessibleName: qsTr("Add marker at the playhead")
            description: qsTr("Add a marker at the playhead")
            onClicked: if (root.gestures) root.gestures.runAction("addMarker")
        }
        Rectangle {
            anchors.bottom: parent.bottom
            width: parent.width
            height: Ui.Metrics.border
            color: Ui.Theme.borderSubtle
        }
        Rectangle {
            anchors.right: parent.right
            width: Ui.Metrics.border
            height: parent.height
            color: Ui.Theme.borderSubtle
        }
    }

    // Lane part: fixed vertically, scrolled horizontally with the lanes.
    Rectangle {
        id: lane
        objectName: "markerLaneViewport"
        x: root.headerWidth
        width: root.width - root.headerWidth
        height: root.height
        clip: true
        color: Ui.Theme.surfaceCanvas
        Rectangle {
            anchors.bottom: parent.bottom
            width: parent.width
            height: Ui.Metrics.border
            color: Ui.Theme.borderSubtle
        }
        Item {
            id: content
            x: root.viewState ? -root.viewState.scrollLeftPx : 0
            height: parent.height
            Repeater {
                model: root.blocks
                delegate: Rectangle {
                    id: block
                    required property var modelData
                    readonly property string markerId: modelData.id
                    readonly property double startMs: modelData.startMs
                    readonly property double endMs: modelData.endMs
                    readonly property string label: modelData.label
                    readonly property color blockColor: modelData.color !== "" ? modelData.color : Ui.Theme.surfaceOverlay
                    readonly property bool chosen: MarkerSession.selectedIds.indexOf(markerId) >= 0
                    // The start while a drag is under way, else -1.
                    property double dragMs: -1
                    objectName: "markerBlock"
                    x: (dragMs >= 0 ? dragMs : startMs) / root.viewState.msPerPx
                    y: Ui.Metrics.micro
                    width: Math.max(Ui.Metrics.xs, (endMs - startMs) / root.viewState.msPerPx - Ui.Metrics.border)
                    height: lane.height - Ui.Metrics.micro * 2 - Ui.Metrics.border
                    radius: Ui.Metrics.xs
                    color: blockColor
                    border.width: chosen ? Ui.Metrics.focus : Ui.Metrics.border
                    border.color: chosen ? Ui.Theme.borderFocus : Ui.Theme.borderControl
                    Ui.Text {
                        anchors.fill: parent
                        anchors.leftMargin: Ui.Metrics.sm
                        anchors.rightMargin: Ui.Metrics.xs
                        verticalAlignment: Text.AlignVCenter
                        text: block.label
                        role: Ui.Typography.SansCaption
                        tone: block.modelData.color !== "" ? Ui.Text.OnAccent : Ui.Text.Primary
                        elide: Text.ElideRight
                    }
                    MouseArea {
                        id: pointer
                        anchors.fill: parent
                        acceptedButtons: Qt.LeftButton
                        preventStealing: true
                        property real pressX: 0
                        property bool moved: false
                        function targetMs(mouse, alt) {
                            const raw = Math.max(0, block.startMs + (mapToItem(content, mouse.x, 0).x - pressX) * root.viewState.msPerPx)
                            const snapping = !alt && root.gestures && root.gestures.snapEnabled
                            return Math.max(0, Math.round(snapping ? sequence.snapMs(raw, root.viewState.gridDivision) : raw))
                        }
                        onPressed: mouse => { pressX = mapToItem(content, mouse.x, 0).x; moved = false }
                        onPositionChanged: mouse => {
                            if (!pressed) return
                            if (!moved && Math.abs(mapToItem(content, mouse.x, 0).x - pressX) < Ui.Metrics.xs) return
                            moved = true
                            block.dragMs = targetMs(mouse, (mouse.modifiers & Qt.AltModifier) !== 0)
                        }
                        onReleased: mouse => {
                            if (!moved) return
                            const ms = targetMs(mouse, (mouse.modifiers & Qt.AltModifier) !== 0)
                            block.dragMs = -1
                            if (ms !== block.startMs && root.timeline)
                                root.timeline.applyEdit("markers.update", { ids: [block.markerId], patch: { timeMs: ms } })
                        }
                        onCanceled: { block.dragMs = -1; moved = false }
                        onClicked: {
                            if (moved) { moved = false; return }
                            MarkerSession.select(block.markerId)
                            if (root.clock) root.clock.seek(block.startMs)
                        }
                        onDoubleClicked: MarkerSession.requestEdit(block.markerId)
                    }
                }
            }
        }
    }
}
