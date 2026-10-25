// Mirrors web/src/components/timeline/TimelineEditor.tsx: the document bar
// and the save warnings, the preview with its transport, the tracks region
// under it, and the shortcut sheet over everything.
import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline

Rectangle {
    id: root
    required property TimelineModel timeline
    required property PlaybackClock clock
    // The AutosaveController of a server timeline (the `autosave` context
    // property main sets), or null.
    property QtObject saver: typeof autosave !== "undefined" ? autosave : null

    color: Theme.backgroundDefault
    focus: true
    Keys.onSpacePressed: root.clock.toggle()
    Keys.forwardTo: [tracksRegion]

    // Samples the monotonic clock into clock.time once per frame while playing.
    FrameAnimation {
        running: root.clock.playing
        onTriggered: root.clock.tick()
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        DocumentBar {
            Layout.fillWidth: true
            timeline: root.timeline
            autosave: root.saver
        }

        SaveBanners {
            Layout.fillWidth: true
            autosave: root.saver
        }

        PreviewArea {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.preferredHeight: root.height * 0.55
            timeline: root.timeline
            clock: root.clock
        }

        TracksRegion {
            id: tracksRegion
            Layout.fillWidth: true
            Layout.preferredHeight: root.height * 0.45
            timeline: root.timeline
            clock: root.clock
            onShortcutsRequested: shortcuts.open = !shortcuts.open
        }
    }

    ShortcutsSheet {
        id: shortcuts
        anchors.fill: parent
        gestures: tracksRegion.gestures
        // Closing gives the keys back to the editor.
        onOpenChanged: if (!open) root.forceActiveFocus()
    }
}
