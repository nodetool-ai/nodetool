// Mirrors the web TimelineEditor: document controls above DockCanvas, stable
// Program and Timeline panels, registered side panels, and editor overlays.
import QtQuick
import QtQuick.Controls.Basic as Controls
import QtQuick.Layouts
import NodeTool.Timeline
import "assets/AssetContext.js" as Context
import NodeTool.UiPrimitives as Ui

Controls.Control {
    id: root
    required property TimelineModel timeline
    required property PlaybackClock clock
    property QtObject saver: typeof autosave !== "undefined" ? autosave : null
    property var chatSession: typeof nativeChatSession !== "undefined" ? nativeChatSession : null
    property var chatHost: typeof nativeChatHost !== "undefined" ? nativeChatHost : null
    readonly property bool chatInitiallyOpen: typeof nativeChatInitiallyOpen !== "undefined" && nativeChatInitiallyOpen
    readonly property bool chatOpen: chatSession !== null && dockCanvas.visiblePanels.indexOf("assistant") >= 0
    readonly property alias dockStore: layoutStore
    readonly property alias dockCanvas: dockCanvas
    // One per editor, because each runs a helper process while in use.
    readonly property FrameCapture frameCapture: FrameCapture { timeline: root.timeline }
    // The frame the Reference panel and the comparison view share.
    readonly property ReferenceController referenceMonitor: ReferenceController {
        capture: root.frameCapture
        clock: root.clock
        owner: tracksHost.item ? tracksHost.item.gestures : null
        onRevealRequested: if (!shownInView) layoutStore.dispatch({type: "reveal", panelId: "reference"})
    }
    // Music mode (docs/MUSIC-MODE.md section 15, BE-5): the backend setup state of
    // this editor, with its own socket, so a download outlives the music panel when
    // the layout hides it. The job module is the timeline's (MusicJobsRegistry).
    readonly property MusicSetupModel musicSetup: MusicSetupModel {}
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
    readonly property var availablePanels: dockPanels.map(panel => panel.id)
    padding: 0
    font: Ui.Typography.font(Ui.Typography.SansBody)
    palette.window: Ui.Theme.surfacePanel
    palette.base: Ui.Theme.surfaceCanvas
    palette.alternateBase: Ui.Theme.surfacePanel
    palette.button: Ui.Theme.surfacePanel
    palette.buttonText: Ui.Theme.textPrimary
    palette.text: Ui.Theme.textPrimary
    palette.windowText: Ui.Theme.textPrimary
    palette.placeholderText: Ui.Theme.textSecondary
    palette.highlight: Ui.Theme.accentPrimary
    palette.highlightedText: Ui.Theme.textOnAccent
    palette.mid: Ui.Theme.borderSubtle
    palette.dark: Ui.Theme.borderSubtle
    background: Rectangle { color: Ui.Theme.surfaceCanvas }
    focus: true
    // Keys.forwardTo below skips a hidden item, and the Timeline is hidden behind another tab
    // or a maximized group, which is when its panel keys are needed most.
    Keys.onPressed: event => {
        const panel = tracksHost.item
        if (panel && !panel.visible && panel.gestures.handleKey(event.key, event.text, event.modifiers, event.isAutoRepeat)) event.accepted = true
    }
    Keys.onSpacePressed: event => {
        if (event.modifiers !== Qt.NoModifier) {
            event.accepted = false
            return
        }
        // In trim mode Space loops around the edit.
        const trim = tracksHost.item ? tracksHost.item.gestures.trimMode : null
        if (!trim || !trim.active) root.clock.toggle()
        else if (!event.isAutoRepeat) trim.toggleLoop()
    }
    Keys.onEscapePressed: event => {
        if (programFullscreen) toggleProgramFullscreen()
        else event.accepted = false
    }
    Keys.forwardTo: tracksHost.item ? [tracksHost.item] : []
    Binding { target: root.clock; property: "durationMs"; value: root.timeline.contentEndMs }
    DockLayoutStore { id: layoutStore; objectName: "dockLayoutStore" }
    function toggleChat() {
        layoutStore.dispatch({type: chatOpen ? "hide" : "reveal", panelId: "assistant"})
    }
    function openStoryResource(kind, id) {
        const panelId = kind === "scripts" ? "script" : kind === "storyboards" ? "storyboard" : ""
        if (!panelId || !id) return
        layoutStore.dispatch({type: "reveal", panelId: panelId})
        const panel = Context.itemNamed(root, panelId === "script" ? "timelineScriptPanel" : "timelineStoryboardPanel")
        if (panel) panel.openResource(id)
    }
    // Reveals the Entities panel and opens its editor on a Library image: a new entity, or an edit when it is one.
    function openEntityEditor(assetId, existing) {
        if (!assetId) return
        layoutStore.dispatch({type: "reveal", panelId: "entities"})
        const panel = Context.itemNamed(root, "timelineEntitiesPanel")
        if (!panel) return
        if (existing) panel.editEntity(assetId)
        else panel.useAsEntity(assetId)
    }
    // The key of an action under the preset, for a tooltip. A preset can use the key itself.
    function keyFor(action) {
        const gestures = tracksHost.item ? tracksHost.item.gestures : null
        return gestures && gestures.keyboardPreset !== "" ? gestures.shortcutFor(action) : ""
    }
    // The panel keys. The two monitors take the focus themselves, because focus on a
    // tab would give Left and Right to the tab strip.
    function focusedPanel() {
        const item = root.Window.activeFocusItem
        if (!item || item === root) return ""
        return dockCanvas.activePanelOfGroup(dockCanvas.groupIdAt(item))
    }
    function focusPanel(id) {
        if (!dockCanvas.revealPanel(id)) return false
        Qt.callLater(() => {
            const host = id === "tracks" ? tracksHost : id === "program" ? programHost : null
            if (host && host.item) host.item.forceActiveFocus()
            else dockCanvas.focusPanelTab(id)
        })
        return true
    }
    function cyclePanel(step) {
        const panels = dockCanvas.visiblePanels
        if (panels.length === 0) return false
        const at = panels.indexOf(focusedPanel() || "tracks")
        return focusPanel(panels[(Math.max(0, at) + step + panels.length) % panels.length])
    }
    function toggleFocusedGroup() {
        if (dockCanvas.maximizedGroup) { dockCanvas.maximizedGroup = ""; return true }
        const groupId = dockCanvas.groupIdAt(root.Window.activeFocusItem === root ? null : root.Window.activeFocusItem)
        dockCanvas.maximizedGroup = groupId || dockCanvas.groupIdOfPanel("tracks")
        return true
    }
    property bool programFullscreen: false
    property int visibilityBeforeFullscreen: Window.Windowed
    function toggleProgramFullscreen() {
        const window = root.Window.window
        if (!window) return false
        if (programFullscreen) {
            programFullscreen = false
            dockCanvas.maximizedGroup = ""
            window.visibility = visibilityBeforeFullscreen
            if (tracksHost.item) tracksHost.item.forceActiveFocus()
            return true
        }
        if (!dockCanvas.revealPanel("program")) return false
        visibilityBeforeFullscreen = window.visibility
        dockCanvas.maximizedGroup = dockCanvas.groupIdOfPanel("program")
        programFullscreen = true
        window.visibility = Window.FullScreen
        // The Timeline had the keys, and it is hidden now.
        if (programHost.item) programHost.item.forceActiveFocus()
        return true
    }
    // Match Frame and Reveal: the asset in the Library, and for Match Frame the Source tab too.
    function revealAsset(assetId, showSource) {
        if (!dockCanvas.revealPanel("assets")) return false
        const explorer = Context.itemNamed(root, "assetExplorer")
        if (explorer) explorer.revealAsset(assetId)
        if (showSource) dockCanvas.revealPanel("source")
        return true
    }
    // Reloads the Library after the Entities panel changes an entity, so its menu names the right action.
    function refreshLibrary() {
        const explorer = Context.itemNamed(root, "assetExplorer")
        if (explorer) explorer.browser.refresh()
    }
    Component.onCompleted: {
        layoutStore.registerPanels(dockPanels)
        if (chatInitiallyOpen) layoutStore.dispatch({type: "reveal", panelId: "assistant"})
    }
    FrameAnimation {
        running: root.clock.playing
        onTriggered: root.clock.tick()
    }
    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            visible: !root.programFullscreen
            ToolButton {
                objectName: "toggleLeftPanels"
                visible: dockCanvas.hasLeft
                label: dockCanvas.leftCollapsed ? qsTr("Show left panels") : qsTr("Hide left panels")
                shortcut: root.keyFor("toggleLeftPanels")
                iconOnly: true
                iconName: "panelLeft"
                active: !dockCanvas.leftCollapsed
                activeFocusOnTab: true
                Layout.leftMargin: Ui.Metrics.md
                onClicked: dockCanvas.leftCollapsed = !dockCanvas.leftCollapsed
            }
            DocumentBar {
                Layout.fillWidth: true
                timeline: root.timeline
                autosave: root.saver
                DockLayoutMenu {
                    anchors.verticalCenter: parent.verticalCenter
                    store: layoutStore
                    panels: root.dockPanels
                }
            }
            ToolButton {
                objectName: "toggleRightPanels"
                visible: dockCanvas.hasRight
                label: dockCanvas.rightCollapsed ? qsTr("Show right panels") : qsTr("Hide right panels")
                shortcut: root.keyFor("toggleRightPanels")
                iconOnly: true
                iconName: "panelRight"
                active: !dockCanvas.rightCollapsed
                activeFocusOnTab: true
                Layout.rightMargin: Ui.Metrics.md
                onClicked: dockCanvas.rightCollapsed = !dockCanvas.rightCollapsed
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
                id: programHost
                dock: dockCanvas
                panelId: "program"
                sourceComponent: Component {
                    PreviewArea {
                        timeline: root.timeline
                        clock: root.clock
                        gestures: tracksHost.item ? tracksHost.item.gestures : null
                    }
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
    Binding {
        target: root.chatHost
        property: "selection"
        value: tracksHost.item && tracksHost.item.gestures ? tracksHost.item.gestures.selection : []
        when: root.chatHost !== null
    }
    PanelSlot { slot: "overlay"; anchors.fill: parent }
    ShortcutsSheet {
        id: shortcuts
        anchors.fill: parent
        gestures: tracksHost.item ? tracksHost.item.gestures : null
    }
}
