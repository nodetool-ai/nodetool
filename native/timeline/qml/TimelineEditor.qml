// Mirrors the web TimelineEditor: document controls above DockCanvas, stable
// Program and Timeline panels, registered side panels, and editor overlays.
import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline

Rectangle {
    id: root
    required property TimelineModel timeline
    required property PlaybackClock clock
    property QtObject saver: typeof autosave !== "undefined" ? autosave : null
    readonly property alias dockStore: layoutStore
    readonly property var dockPanels: {
        const panels = [{id: "program", title: "Program", defaultRegion: "viewport"},
                        {id: "tracks", title: "Timeline", defaultRegion: "bottom"}]
        for (const slot of ["left", "right", "bottom"]) {
            for (const panel of PanelRegistry.forSlot(slot)) {
                panels.push({id: panel.id, title: panel.title || panel.id,
                    defaultRegion: panel.id === "source" ? "viewport" : slot})
            }
        }
        return panels
    }
    readonly property var availablePanels: dockPanels.filter(panel => panel.id !== "source" || !!SourceViewerState.asset.id).map(panel => panel.id)
    color: Theme.backgroundDefault
    focus: true
    Keys.onSpacePressed: root.clock.toggle()
    Keys.forwardTo: tracksHost.item ? [tracksHost.item] : []
    DockLayoutStore { id: layoutStore; objectName: "dockLayoutStore" }
    Component.onCompleted: layoutStore.registerPanels(dockPanels)
    FrameAnimation {
        running: root.clock.playing
        onTriggered: root.clock.tick()
    }
    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        RowLayout {
            Layout.fillWidth: true
            spacing: Theme.spacingMd
            DocumentBar {
                Layout.fillWidth: true
                timeline: root.timeline
                autosave: root.saver
            }
            DockLayoutMenu {
                store: layoutStore
                panels: root.dockPanels
                Layout.rightMargin: Theme.spacingMd
            }
        }
        SaveBanners { Layout.fillWidth: true; autosave: root.saver }
        DockCanvas {
            id: dockCanvas
            Layout.fillWidth: true
            Layout.fillHeight: true
            store: layoutStore
            registry: root.dockPanels
            availableIds: root.availablePanels
            StablePanelHost {
                dock: dockCanvas
                panelId: "program"
                sourceComponent: Component {
                    PreviewArea { timeline: root.timeline; clock: root.clock }
                }
            }
            StablePanelHost {
                id: tracksHost
                dock: dockCanvas
                panelId: "tracks"
                sourceComponent: Component {
                    TimelineTracksPanel {
                        timeline: root.timeline
                        clock: root.clock
                        onShortcutsRequested: shortcuts.open = !shortcuts.open
                    }
                }
            }
            PanelSlot { slot: "left"; dock: dockCanvas; anchors.fill: parent }
            PanelSlot { slot: "right"; dock: dockCanvas; anchors.fill: parent }
            PanelSlot { slot: "bottom"; dock: dockCanvas; anchors.fill: parent }
        }
    }
    PanelSlot { slot: "overlay"; anchors.fill: parent }
    ShortcutsSheet {
        id: shortcuts
        anchors.fill: parent
        gestures: tracksHost.item ? tracksHost.item.gestures : null
        onOpenChanged: if (!open) root.forceActiveFocus()
    }
}
