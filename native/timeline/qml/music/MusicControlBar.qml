// nt-panel: slot=documentBar id=musicControlBar order=20 title="Music control bar"
// The control bar of the Music layout, Logic's top row: Rewind, Forward, Stop,
// Play, Loop range, then one display with the position as bar and beat in
// large digits, the tempo, and the time signature above the key. It sits in the
// documentBar slot, which right-aligns its panels, and shows only while the
// Music layout shows a music sequence. Every control calls an existing action:
// the clock, the tempo settings dialog, the `music.setKey` edit and the
// gesture controller's loop. Rewind and Forward move to the bar lines of the
// tempo (MusicSequenceState.adjacentBarMs). Stop pauses, and from a stopped
// clock returns to 0.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.TimelinePlayer
import NodeTool.UiPrimitives as Ui
import "MusicLayout.js" as MusicLayout
import "../assets/AssetContext.js" as Context

Item {
    id: root
    objectName: "musicControlBar"
    property TimelineModel timeline: null
    property var editor: null
    // The tracks region holds the gesture controller and the view state.
    property var region: null
    readonly property PlaybackClock clock: editor ? editor.clock : null
    readonly property ClipGestureController gestures: region ? region.gestures : null
    readonly property TimelineViewState viewState: region ? region.viewState : null
    readonly property bool shown: !!editor && !!editor.dockStore && editor.dockStore.workspace === "Music" && sequence.isMusic
    readonly property MusicSelection selection: gestures ? gestures.musicSelection : null
    readonly property bool looping: !!selection && selection.active && !!clock && clock.loop && !!viewState
        && viewState.rangeInMs === selection.startMs && viewState.rangeOutMs === selection.endMs
    readonly property string lockText: qsTr("Tempo is locked because the project contains audio. Remove all audio clips to change it.")
    readonly property var positionParts: clock ? sequence.positionLabel(clock.time).split(".") : []
    readonly property var keyOptions: {
        const options = []
        for (const tonic of MusicProjectRules.keyTonics) {
            if (tonic.value === "") {
                options.push({label: tonic.label, value: ""})
                continue
            }
            for (const mode of MusicProjectRules.keyModes) {
                options.push({label: tonic.label + " " + mode.value, value: tonic.value + " " + mode.value})
            }
        }
        return options
    }
    visible: shown
    implicitWidth: shown ? row.implicitWidth : 0
    implicitHeight: row.implicitHeight

    function shortcut(action) {
        return gestures && gestures.keyboardPreset !== "" ? gestures.shortcutFor(action) : ""
    }
    function rewind() {
        if (clock) clock.seek(sequence.adjacentBarMs(clock.time, -1))
    }
    function forward() {
        if (clock) clock.seek(sequence.adjacentBarMs(clock.time, 1))
    }
    // Stop pauses playback. A clock that is already stopped returns to 0.
    function stop() {
        if (!clock) return
        if (clock.playing) clock.pause()
        else clock.seek(0)
    }
    // Writes the key through one undoable edit; the tempo lock allows it (MD6).
    function setKey(value) {
        if (!timeline) return false
        const parts = String(value).split(" ")
        return timeline.applyEdit("music.setKey", value === "" ? {tonic: ""} : {tonic: parts[0], mode: parts[1]}) !== 0
    }
    function openTempoSettings() {
        const dialog = Context.itemNamed(editor, "ProjectSettingsDialog")
        if (dialog) dialog.open()
        return !!dialog
    }
    function attach() {
        if (!editor) editor = MusicLayout.editorOf(root)
        if (editor && !region) region = Context.itemNamed(editor, "tracksRegion")
    }
    Component.onCompleted: attach()
    Timer {
        interval: 50
        repeat: true
        running: !root.editor || !root.region
        onTriggered: root.attach()
    }
    MusicSequenceState {
        id: sequence
        timeline: root.timeline
    }

    component TransportButton: ToolButton {
        anchors.verticalCenter: parent ? parent.verticalCenter : undefined
        iconOnly: true
    }
    component DisplayDivider: Rectangle {
        anchors.verticalCenter: parent ? parent.verticalCenter : undefined
        width: Ui.Metrics.border
        height: Ui.Metrics.xxl
        color: Ui.Theme.borderSubtle
    }
    // A figure in large digits over its small label.
    component Figure: Column {
        id: figure
        property string figureText: ""
        property string caption: ""
        property real minWidth: 0
        anchors.verticalCenter: parent ? parent.verticalCenter : undefined
        Ui.Text {
            objectName: figure.objectName + "Value"
            anchors.horizontalCenter: parent.horizontalCenter
            text: figure.figureText
            role: Ui.Typography.SansTitle
            tight: true
        }
        Ui.Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: figure.caption
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            tight: true
        }
    }

    Row {
        id: row
        anchors.verticalCenter: parent.verticalCenter
        spacing: Ui.Metrics.xs

        TransportButton {
            objectName: "musicRewind"
            label: qsTr("Rewind")
            description: qsTr("Go to the previous bar line")
            iconName: "skipPrevious"
            onClicked: root.rewind()
        }
        TransportButton {
            objectName: "musicForward"
            label: qsTr("Forward")
            description: qsTr("Go to the next bar line")
            iconName: "skipNext"
            onClicked: root.forward()
        }
        TransportButton {
            objectName: "musicStop"
            label: qsTr("Stop")
            description: qsTr("Stop playback. Stop again to go to the start")
            iconName: "stop"
            onClicked: root.stop()
        }
        TransportButton {
            objectName: "musicPlay"
            label: root.clock && root.clock.playing ? qsTr("Pause") : qsTr("Play")
            shortcut: root.shortcut("playPause")
            iconName: root.clock && root.clock.playing ? "pause" : "playArrow"
            active: !!root.clock && root.clock.playing
            onClicked: if (root.clock) root.clock.toggle()
        }
        TransportButton {
            objectName: "musicLoopRange"
            label: qsTr("Loop range")
            shortcut: root.shortcut("loopMusicRange")
            description: qsTr("Play the selected range in a loop")
            iconName: "repeat"
            active: root.looping
            enabled: !!root.selection && root.selection.active
            onClicked: if (root.gestures) root.gestures.loopMusicSelection()
        }
        Rectangle {
            id: display
            objectName: "musicDisplay"
            anchors.verticalCenter: parent.verticalCenter
            implicitWidth: displayRow.implicitWidth + 2 * Ui.Metrics.md
            height: TimelineMetrics.documentBarHeight - 2 * Ui.Metrics.xs
            radius: Ui.Metrics.radiusControl
            color: Ui.Theme.surfaceInput
            border.width: Ui.Metrics.border
            border.color: Ui.Theme.borderSubtle
            Row {
                id: displayRow
                anchors.centerIn: parent
                spacing: Ui.Metrics.md
                Row {
                    id: positionRow
                    objectName: "musicPosition"
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Ui.Metrics.sm
                    readonly property string text: root.positionParts.length >= 2 ? root.positionParts[0] + "." + root.positionParts[1] : ""
                    Accessible.name: qsTr("Position %1").arg(text)
                    Figure {
                        objectName: "musicPositionBar"
                        figureText: root.positionParts.length >= 2 ? root.positionParts[0] : ""
                        caption: qsTr("BAR")
                        width: Math.max(implicitWidth, Ui.Metrics.xxxl)
                    }
                    Figure {
                        objectName: "musicPositionBeat"
                        figureText: root.positionParts.length >= 2 ? root.positionParts[1] : ""
                        caption: qsTr("BEAT")
                        width: Math.max(implicitWidth, Ui.Metrics.xl)
                    }
                }
                DisplayDivider {}
                Item {
                    id: tempoChip
                    objectName: "musicTempoChip"
                    anchors.verticalCenter: parent.verticalCenter
                    readonly property bool locked: sequence.tempoLocked
                    readonly property string text: sequence.tempoChip
                    readonly property string iconName: locked ? "lock" : ""
                    readonly property string description: locked ? root.lockText : qsTr("Change the tempo and time signature in Project settings")
                    implicitWidth: tempoFigure.implicitWidth + (tempoLock.visible ? tempoLock.width + Ui.Metrics.xs : 0)
                    implicitHeight: tempoFigure.implicitHeight
                    Accessible.role: Accessible.Button
                    Accessible.name: locked ? qsTr("Tempo %1, locked").arg(text) : qsTr("Tempo %1").arg(text)
                    Accessible.onPressAction: root.openTempoSettings()
                    Figure {
                        id: tempoFigure
                        objectName: "musicTempo"
                        anchors.verticalCenter: parent.verticalCenter
                        figureText: sequence.bpm > 0 ? String(sequence.bpm) : ""
                        caption: qsTr("TEMPO")
                        width: Math.max(implicitWidth, Ui.Metrics.xxxl)
                    }
                    Ui.Icon {
                        id: tempoLock
                        anchors.right: parent.right
                        anchors.top: parent.top
                        visible: tempoChip.locked
                        name: "lock"
                        size: Ui.Metrics.iconXs
                    }
                    Ui.EditorButton {
                        id: tempoArea
                        objectName: "musicTempoArea"
                        anchors.fill: parent
                        anchors.margins: -Ui.Metrics.xs
                        variant: Ui.EditorButton.Flat
                        density: Ui.EditorButton.Compact
                        accessibleName: tempoChip.Accessible.name
                        description: tempoChip.description
                        onClicked: root.openTempoSettings()
                    }
                }
                DisplayDivider {}
                Column {
                    anchors.verticalCenter: parent.verticalCenter
                    Ui.Text {
                        objectName: "musicTimeSignature"
                        anchors.horizontalCenter: parent.horizontalCenter
                        text: sequence.timeSignature
                        role: Ui.Typography.MonoCaption
                        tone: Ui.Text.Secondary
                        tight: true
                        Accessible.name: qsTr("Time signature %1").arg(text)
                    }
                    Ui.Select {
                        objectName: "musicKeySelect"
                        height: Ui.Metrics.iconLg
                        density: Ui.EditorButton.Compact
                        accessibleName: qsTr("Key")
                        options: root.keyOptions
                        value: sequence.keyText
                        onValueCommitted: value => root.setKey(value)
                    }
                }
            }
        }
    }
}
