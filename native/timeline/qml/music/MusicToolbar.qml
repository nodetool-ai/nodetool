// nt-panel: slot=toolbarVariant id=musicToolbar order=10 title="Music toolbar"
// The Timeline panel's tool row in the Music layout (docs/MUSIC-MODE.md section
// 15, the music mode mockup's header): the project name, the tempo chip with
// the lock of MD6, the key, the Range and Select tools with their keys from
// the keymap, Snap (bar or beat, the ruler's grid division), Undo and Redo,
// Play, Loop range and the position as bar.beat.tick. It replaces ToolToggle
// while it reports a width (TracksRegion's toolbarVariant slot), so other
// layouts keep the editing tools. Every control calls an existing action: the
// tempo settings dialog, the `music.setKey` edit, the controller's tools and
// loop, the undo stack and the clock.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "MusicLayout.js" as MusicLayout
import "../assets/AssetContext.js" as Context

Item {
    id: root
    objectName: "musicToolbar"
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    property PlaybackClock clock: null
    property bool compact: false
    property var editor: null
    readonly property bool shown: !!editor && !!editor.dockStore && editor.dockStore.workspace === "Music" && sequence.isMusic
    readonly property MusicSelection selection: gestures ? gestures.musicSelection : null
    readonly property bool looping: !!selection && selection.active && !!clock && clock.loop && !!viewState
        && viewState.rangeInMs === selection.startMs && viewState.rangeOutMs === selection.endMs
    readonly property string lockText: qsTr("Tempo is locked because the project contains audio. Remove all audio clips to change it.")
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

    // A tool with its key in a chip after the label, as in the mockup.
    component KeyedTool: ToolButton {
        id: keyed
        property string chip: ""
        readonly property bool chipShown: chip !== "" && showLabel
        anchors.verticalCenter: parent ? parent.verticalCenter : undefined
        compact: root.compact
        shortcut: chip
        rightPadding: (showLabel ? Ui.Metrics.lg : Ui.Metrics.sm) + (chipShown ? keyHint.implicitWidth + Ui.Metrics.sm : 0)
        Ui.ShortcutHint {
            id: keyHint
            objectName: keyed.objectName + "Key"
            visible: keyed.chipShown
            anchors.right: parent.right
            anchors.rightMargin: Ui.Metrics.lg
            anchors.verticalCenter: parent.verticalCenter
            text: keyed.chip
        }
    }

    Row {
        id: row
        anchors.verticalCenter: parent.verticalCenter
        spacing: Ui.Metrics.sm

        Column {
            anchors.verticalCenter: parent.verticalCenter
            Ui.Text {
                objectName: "musicProjectName"
                width: Math.min(implicitWidth, Ui.Metrics.dialogCompactWidth / 2)
                elide: Text.ElideRight
                text: root.timeline ? root.timeline.name : ""
                role: Ui.Typography.SansLabel
            }
            Ui.Text {
                objectName: "musicProjectSubtitle"
                visible: !root.compact
                text: qsTr("Music project")
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
        }
        ToolbarDivider { anchors.verticalCenter: parent.verticalCenter }
        Ui.EditorButton {
            objectName: "musicTempoChip"
            anchors.verticalCenter: parent.verticalCenter
            density: Ui.EditorButton.Compact
            iconName: sequence.tempoLocked ? "lock" : ""
            text: sequence.tempoChip
            textRole: Ui.Typography.MonoLabel
            accessibleName: sequence.tempoLocked ? qsTr("Tempo %1, locked").arg(sequence.tempoChip) : qsTr("Tempo %1").arg(sequence.tempoChip)
            description: sequence.tempoLocked ? root.lockText : qsTr("Change the tempo and time signature in Project settings")
            onClicked: root.openTempoSettings()
        }
        Ui.Select {
            objectName: "musicKeySelect"
            anchors.verticalCenter: parent.verticalCenter
            density: Ui.EditorButton.Compact
            accessibleName: qsTr("Key")
            options: root.keyOptions
            value: sequence.keyText
            onValueCommitted: value => root.setKey(value)
        }
        ToolbarDivider { anchors.verticalCenter: parent.verticalCenter }
        KeyedTool {
            objectName: "musicTool_range"
            label: qsTr("Range")
            chip: root.shortcut("rangeTool")
            description: qsTr("Drag across bars on a track to choose what to generate. Alt places an edge freely")
            iconName: "piano"
            active: !!root.gestures && root.gestures.activeTool === "range"
            onClicked: if (root.gestures) root.gestures.activeTool = "range"
        }
        KeyedTool {
            objectName: "musicTool_select"
            label: qsTr("Select")
            chip: root.shortcut("selectTool")
            iconName: "toolSelect"
            active: !!root.gestures && root.gestures.activeTool === "select"
            onClicked: if (root.gestures) root.gestures.activeTool = "select"
        }
        Ui.Select {
            objectName: "musicSnapSelect"
            anchors.verticalCenter: parent.verticalCenter
            density: Ui.EditorButton.Compact
            accessibleName: qsTr("Snap")
            options: [{label: qsTr("Snap: bar"), value: "bar"}, {label: qsTr("Snap: beat"), value: "beat"}]
            // Every division finer than a bar snaps a range to beats (MusicRange.h).
            value: root.viewState && root.viewState.gridDivision === "bar" ? "bar" : "beat"
            onValueCommitted: value => { if (root.viewState) root.viewState.gridDivision = value }
        }
        ToolbarDivider { anchors.verticalCenter: parent.verticalCenter }
        ToolButton {
            objectName: "musicUndo"
            anchors.verticalCenter: parent.verticalCenter
            label: qsTr("Undo")
            iconOnly: true
            iconName: "undo"
            enabled: !!root.timeline && root.timeline.undoStack.canUndo
            onClicked: root.timeline.undoStack.undo()
        }
        ToolButton {
            objectName: "musicRedo"
            anchors.verticalCenter: parent.verticalCenter
            label: qsTr("Redo")
            iconOnly: true
            iconName: "redo"
            enabled: !!root.timeline && root.timeline.undoStack.canRedo
            onClicked: root.timeline.undoStack.redo()
        }
        ToolbarDivider { anchors.verticalCenter: parent.verticalCenter }
        ToolButton {
            objectName: "musicPlay"
            anchors.verticalCenter: parent.verticalCenter
            label: root.clock && root.clock.playing ? qsTr("Pause") : qsTr("Play")
            shortcut: root.shortcut("playPause")
            iconOnly: true
            iconName: root.clock && root.clock.playing ? "pause" : "playArrow"
            onClicked: if (root.clock) root.clock.toggle()
        }
        KeyedTool {
            objectName: "musicLoopRange"
            label: qsTr("Loop range")
            chip: root.shortcut("loopMusicRange")
            description: qsTr("Play the selected range in a loop")
            iconName: "repeat"
            active: root.looping
            enabled: !!root.selection && root.selection.active
            onClicked: if (root.gestures) root.gestures.loopMusicSelection()
        }
        Ui.Text {
            objectName: "musicPosition"
            anchors.verticalCenter: parent.verticalCenter
            text: root.clock ? sequence.positionLabel(root.clock.time) : ""
            role: Ui.Typography.MonoLabel
            Accessible.name: qsTr("Position %1").arg(text)
        }
    }
}
