// nt-panel: slot=laneOverlay id=musicRange order=10 title="Music range"
// The music range on its lane (docs/MUSIC-MODE.md section 7, MD10): a band
// with the bar numbers at both edges, and the control that makes the range
// the loop region, the sequence In and Out range with the loop on. The band
// takes no pointer input, so the Range tool's drags reach the lane and clips.
import QtQuick
import NodeTool.Timeline
import NodeTool.TimelinePlayer
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    property var track: ({})
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    readonly property MusicSelection selection: gestures ? gestures.musicSelection : null
    readonly property bool shown: !!selection && selection.active && selection.trackId === (track.id || "")
    readonly property double msPerPx: viewState ? viewState.msPerPx : 10
    readonly property PlaybackClock clock: gestures ? gestures.clock : null
    readonly property bool looping: shown && !!clock && clock.loop && !!viewState
        && viewState.rangeInMs === selection.startMs && viewState.rangeOutMs === selection.endMs

    MusicSequenceState {
        id: sequence
        timeline: root.shown ? root.timeline : null
    }

    Rectangle {
        id: band
        objectName: "musicRangeBand-" + (root.track.id || "")
        visible: root.shown
        x: root.shown ? root.selection.startMs / root.msPerPx : 0
        width: root.shown ? Math.max(Ui.Metrics.border, (root.selection.endMs - root.selection.startMs) / root.msPerPx) : 0
        height: parent.height
        color: TimelineVisuals.rangeFill
        border.width: Ui.Metrics.border
        border.color: TimelineVisuals.editBlue

        Ui.Text {
            objectName: "musicRangeStartBar"
            x: Ui.Metrics.xs
            y: Ui.Metrics.xs
            text: root.shown ? sequence.barLabel(root.selection.startFrame) : ""
            role: Ui.Typography.MonoCaption
        }
        Ui.Text {
            objectName: "musicRangeEndBar"
            anchors.right: parent.right
            anchors.rightMargin: Ui.Metrics.xs
            y: Ui.Metrics.xs
            visible: band.width > implicitWidth * 3
            text: root.shown ? sequence.barLabel(root.selection.endFrame) : ""
            role: Ui.Typography.MonoCaption
        }
        Row {
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            anchors.margins: Ui.Metrics.xs
            spacing: Ui.Metrics.xs
            visible: band.width > Ui.Metrics.compact + 2 * Ui.Metrics.xs && band.height > Ui.Metrics.compact + 2 * Ui.Metrics.xs

            Ui.EditorButton {
                objectName: "musicRangeCreateMidi-" + (root.track.id || "")
                visible: root.track.type === "midi" && !root.track.locked
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                iconName: "add"
                accessibleName: qsTr("Create MIDI clip")
                description: qsTr("Create an empty MIDI clip on this range")
                onClicked: {
                    if (!root.timeline || !root.selection) return
                    const ok = root.timeline.applyEdit("music.createMidiClip", {
                        trackId: root.selection.trackId,
                        startMs: root.selection.startMs,
                        durationMs: root.selection.endMs - root.selection.startMs
                    })
                    if (ok) root.selection.clear()
                }
            }
            Ui.EditorButton {
                objectName: "musicRangeLoop-" + (root.track.id || "")
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                iconName: "repeat"
                active: root.looping
                accessibleName: root.looping ? qsTr("Loop is on for this range") : qsTr("Loop this range")
                description: qsTr("Play this range in a loop, from its In to its Out point")
                onClicked: if (root.gestures) root.gestures.loopMusicSelection()
            }
        }
    }
    MusicSectionRange {
        anchors.fill: parent
        track: root.track
        gestures: root.gestures
        viewState: root.viewState
    }

}
