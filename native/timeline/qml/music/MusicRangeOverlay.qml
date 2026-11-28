// nt-panel: slot=laneOverlay id=musicRange order=10 title="Music range"
// The music range on its lane (docs/MUSIC-MODE.md section 7, MD10): a band
// with the bar numbers at both edges, and the control that makes the range
// the loop region, the sequence In and Out range with the loop on. The band
// takes no pointer input, so the Range tool's drags reach the lane and clips.
import QtQuick
import QtQuick.Controls
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

    // The Step Sequencer's create path: one undo entry (create_pattern_region).
    StepSequencerController {
        id: patternCreator
        timeline: root.timeline
    }
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
                id: createButton
                objectName: "musicRangeCreate-" + (root.track.id || "")
                visible: root.track.type === "midi" && !root.track.locked
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                iconName: "add"
                accessibleName: qsTr("Create region")
                description: qsTr("Create an empty MIDI region or pattern region on this range")
                onClicked: createMenu.openAt(createButton)
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
    Ui.ContextMenu {
        id: createMenu
        objectName: "musicRangeCreateMenu-" + (root.track.id || "")
        parent: Overlay.overlay
        entries: [
            {id: "midi", label: qsTr("MIDI")},
            {id: "pattern", label: qsTr("Pattern")}
        ]
        onEntryTriggered: id => root.createRegion(id)
    }
    // "midi": an empty MIDI region. "pattern": an empty pattern region, selected.
    function createRegion(kind) {
        if (!root.timeline || !root.selection) return
        const trackId = root.selection.trackId
        const startMs = root.selection.startMs
        const durationMs = root.selection.endMs - root.selection.startMs
        if (kind === "midi") {
            if (root.timeline.applyEdit("music.createMidiClip", {trackId: trackId, startMs: startMs, durationMs: durationMs})) root.selection.clear()
            return
        }
        const result = patternCreator.createPatternRegion(trackId, startMs, durationMs)
        if (!result.ok) return
        root.selection.clear()
        if (root.gestures) root.gestures.selection = [result.clip.id]
    }
    MusicSectionRange {
        anchors.fill: parent
        track: root.track
        gestures: root.gestures
        viewState: root.viewState
    }

}
