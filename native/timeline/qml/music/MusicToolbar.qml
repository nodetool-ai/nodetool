// nt-panel: slot=toolbarVariant id=musicToolbar order=10 title="Music toolbar"
// The Timeline panel's tool row in the Music layout, split as Logic splits it:
// the transport, the position, the tempo and the key sit in MusicControlBar at
// the top of the window. This row, the tracks-area toolbar, holds the Edit,
// Functions and View menus, the Catch toggle, the tool menu, Snap, Drag and the
// two zoom sliders. It replaces ToolToggle while it reports a width
// (TracksRegion's toolbarVariant slot), so other layouts keep the editing
// tools. Every control calls an existing action: the controller's actions and
// tools, its snap and drop mode, the undo stack and the view state. Undo and
// Redo live in the Edit menu with their keys.
//
// One tool menu, not a left-click and a Cmd-click pair: the controller reads
// its active tool at every press and Cmd already means insert on a drop and a
// rolling trim, so a per-press tool needs a change across the controller.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.TimelinePlayer
import NodeTool.UiPrimitives as Ui
import "MusicLayout.js" as MusicLayout
import "MusicSnap.js" as MusicSnap

Item {
    id: root
    objectName: "musicToolbar"
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    property PlaybackClock clock: null
    property bool compact: false
    property var editor: null
    // The tracks region that hosts this row. Catch is its followPlayhead.
    property var region: null
    // Smart, a grid division, Bar or Beat. Smart follows the zoom.
    property string snapValue: "smart"
    readonly property bool shown: !!editor && !!editor.dockStore && editor.dockStore.workspace === "Music" && sequence.isMusic
    readonly property bool catching: !!region && region.followPlayhead
    // The Smart step in ticks at the current zoom and tempo (the contract's smartSnapTicks).
    readonly property real smartTicks: viewState
        ? MusicSnap.smartStep(viewState.msPerPx, sequence.bpm, sequence.beatsPerBar, sequence.beatUnit) : 0
    readonly property string smartDivision: MusicSnap.divisionFor(smartTicks, sequence.beatsPerBar, sequence.beatUnit)
    readonly property var tools: [
        {tool: "select", action: "selectTool", label: qsTr("Select"), icon: "toolSelect"},
        {tool: "range", action: "rangeTool", label: qsTr("Range"), icon: "piano"},
        {tool: "cut", action: "cutTool", label: qsTr("Cut"), icon: "contentCut"},
        {tool: "trackSelect", action: "trackSelectTool", label: qsTr("Track select"), icon: "toolTrackSelect"},
        {tool: "trackSelectBackward", action: "trackSelectBackwardTool", label: qsTr("Track select backward"), icon: "toolTrackSelectBackward"},
        {tool: "ripple", action: "rippleTool", label: qsTr("Ripple edit"), icon: "toolRipple"},
        {tool: "roll", action: "rollTool", label: qsTr("Rolling edit"), icon: "toolRoll"},
        {tool: "rateStretch", action: "rateStretchTool", label: qsTr("Rate stretch"), icon: "toolRateStretch"},
        {tool: "slip", action: "slipTool", label: qsTr("Slip"), icon: "toolSlip"},
        {tool: "slide", action: "slideTool", label: qsTr("Slide"), icon: "toolSlide"},
        {tool: "hand", action: "handTool", label: qsTr("Hand"), icon: "toolHand"},
        {tool: "zoom", action: "zoomTool", label: qsTr("Zoom"), icon: "toolZoom"}
    ]
    readonly property var currentTool: {
        const tool = gestures ? gestures.activeTool : "select"
        return tools.find(entry => entry.tool === tool) || tools[0]
    }
    readonly property var dragModes: [
        {label: qsTr("Overwrite"), value: "overwrite"},
        {label: qsTr("Insert"), value: "insert"},
        {label: qsTr("Overlap"), value: "overlap"}
    ]
    visible: shown
    implicitWidth: shown ? row.implicitWidth : 0
    implicitHeight: row.implicitHeight

    function shortcut(action) {
        return gestures && gestures.keyboardPreset !== "" ? gestures.shortcutFor(action) : ""
    }
    function run(action) { return !!gestures && gestures.runAction(action) }
    function setSnapValue(value) {
        snapValue = value
        if (value !== "smart" && viewState) viewState.gridDivision = value
    }
    function toggleCatch() {
        if (region) region.followPlayhead = !region.followPlayhead
    }
    function attach() {
        editor = MusicLayout.editorOf(root)
        for (let parent = root.parent; parent && !region; parent = parent.parent) {
            if (parent.objectName === "tracksRegion") region = parent
        }
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
    // Smart sets the ruler's division from the zoom, so the range tool and the grid follow it.
    Binding {
        target: root.viewState
        property: "gridDivision"
        value: root.smartDivision
        when: root.shown && root.snapValue === "smart" && !!root.viewState
        restoreMode: Binding.RestoreNone
    }

    component ActionItem: Ui.MenuItem {
        id: entry
        property string actionName: ""
        shortcutText: root.shortcut(actionName)
        onTriggered: root.run(actionName)
    }

    Row {
        id: row
        anchors.verticalCenter: parent.verticalCenter
        spacing: Ui.Metrics.sm

        Ui.MenuButton {
            objectName: "musicEditMenuButton"
            anchors.verticalCenter: parent.verticalCenter
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            text: qsTr("Edit")
            menu: editMenu
            Ui.ContextMenu {
                id: editMenu
                objectName: "musicEditMenu"
                Ui.MenuItem {
                    objectName: "musicUndo"
                    text: qsTr("Undo")
                    shortcutText: root.shortcut("undo")
                    enabled: !!root.timeline && root.timeline.undoStack.canUndo
                    onTriggered: root.timeline.undoStack.undo()
                }
                Ui.MenuItem {
                    objectName: "musicRedo"
                    text: qsTr("Redo")
                    shortcutText: root.shortcut("redo")
                    enabled: !!root.timeline && root.timeline.undoStack.canRedo
                    onTriggered: root.timeline.undoStack.redo()
                }
                Ui.MenuSeparator {}
                ActionItem { objectName: "musicEdit_cut"; text: qsTr("Cut"); actionName: "cut" }
                ActionItem { objectName: "musicEdit_copy"; text: qsTr("Copy"); actionName: "copy" }
                ActionItem { objectName: "musicEdit_paste"; text: qsTr("Paste"); actionName: "paste" }
                ActionItem { objectName: "musicEdit_pasteInsert"; text: qsTr("Paste insert"); actionName: "pasteInsert" }
                ActionItem { objectName: "musicEdit_duplicate"; text: qsTr("Duplicate"); actionName: "duplicate" }
                ActionItem { objectName: "musicEdit_delete"; text: qsTr("Delete"); actionName: "deleteSelected" }
                Ui.MenuSeparator {}
                ActionItem { objectName: "musicEdit_selectAll"; text: qsTr("Select all"); actionName: "selectAll" }
                ActionItem { objectName: "musicEdit_deselectAll"; text: qsTr("Deselect all"); actionName: "deselectAll" }
            }
        }
        Ui.MenuButton {
            objectName: "musicFunctionsMenuButton"
            anchors.verticalCenter: parent.verticalCenter
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            text: qsTr("Functions")
            menu: functionsMenu
            Ui.ContextMenu {
                id: functionsMenu
                objectName: "musicFunctionsMenu"
                ActionItem { objectName: "musicFn_split"; text: qsTr("Split at playhead"); actionName: "splitAtPlayhead" }
                ActionItem { objectName: "musicFn_group"; text: qsTr("Group clips"); actionName: "groupClips" }
                ActionItem { objectName: "musicFn_ungroup"; text: qsTr("Ungroup clips"); actionName: "ungroupClips" }
                Ui.MenuSeparator {}
                ActionItem { objectName: "musicFn_markIn"; text: qsTr("Mark in"); actionName: "markIn" }
                ActionItem { objectName: "musicFn_markOut"; text: qsTr("Mark out"); actionName: "markOut" }
                ActionItem { objectName: "musicFn_clearRange"; text: qsTr("Clear range"); actionName: "clearRange" }
                Ui.MenuSeparator {}
                ActionItem { objectName: "musicFn_addMarker"; text: qsTr("Add marker"); actionName: "addMarker" }
                ActionItem { objectName: "musicFn_nextMarker"; text: qsTr("Next marker"); actionName: "nextMarker" }
                ActionItem { objectName: "musicFn_prevMarker"; text: qsTr("Previous marker"); actionName: "prevMarker" }
            }
        }
        Ui.MenuButton {
            objectName: "musicViewMenuButton"
            anchors.verticalCenter: parent.verticalCenter
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            text: qsTr("View")
            menu: viewMenu
            Ui.ContextMenu {
                id: viewMenu
                objectName: "musicViewMenu"
                ActionItem { objectName: "musicView_zoomIn"; text: qsTr("Zoom in"); actionName: "zoomIn" }
                ActionItem { objectName: "musicView_zoomOut"; text: qsTr("Zoom out"); actionName: "zoomOut" }
                ActionItem { objectName: "musicView_zoomFit"; text: qsTr("Zoom to fit"); actionName: "zoomFit" }
                ActionItem { objectName: "musicView_zoomSelection"; text: qsTr("Zoom to selection"); actionName: "zoomSelection" }
                Ui.MenuSeparator {}
                Ui.MenuItem {
                    objectName: "musicView_catch"
                    text: qsTr("Catch playhead")
                    checkable: true
                    checked: root.catching
                    onTriggered: root.toggleCatch()
                }
                Ui.MenuItem {
                    objectName: "musicView_snap"
                    text: qsTr("Snap")
                    shortcutText: root.shortcut("toggleSnap")
                    checkable: true
                    checked: !!root.gestures && root.gestures.snapEnabled
                    onTriggered: if (root.gestures) root.gestures.snapEnabled = !root.gestures.snapEnabled
                }
                ActionItem { objectName: "musicView_shortcuts"; text: qsTr("Keyboard shortcuts"); actionName: "toggleShortcuts" }
            }
        }
        ToolbarDivider { anchors.verticalCenter: parent.verticalCenter }
        ToolButton {
            objectName: "musicCatch"
            anchors.verticalCenter: parent.verticalCenter
            label: qsTr("Catch")
            description: qsTr("The tracks scroll to keep the playhead in view during playback")
            iconOnly: true
            iconName: "myLocation"
            active: root.catching
            iconColor: root.catching ? TimelineVisuals.editBlue : undefined
            onClicked: root.toggleCatch()
        }
        Ui.MenuButton {
            objectName: "musicToolMenuButton"
            anchors.verticalCenter: parent.verticalCenter
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            iconName: root.currentTool.icon
            accessibleName: qsTr("Tool: %1").arg(root.currentTool.label)
            description: qsTr("The tool a click uses on the tracks")
            menu: toolMenu
            Ui.ContextMenu {
                id: toolMenu
                objectName: "musicToolMenu"
                Repeater {
                    model: root.tools
                    delegate: Ui.MenuItem {
                        id: toolEntry
                        required property var modelData
                        objectName: "musicTool_" + modelData.tool
                        text: modelData.label
                        iconName: modelData.icon
                        shortcutText: root.shortcut(modelData.action)
                        checkable: true
                        checked: !!root.gestures && root.gestures.activeTool === modelData.tool
                        onTriggered: if (root.gestures) root.gestures.activeTool = modelData.tool
                    }
                }
            }
        }
        ToolbarDivider { anchors.verticalCenter: parent.verticalCenter }
        Ui.Text {
            anchors.verticalCenter: parent.verticalCenter
            text: qsTr("Snap:")
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
        }
        ToolButton {
            objectName: "musicSnapPower"
            anchors.verticalCenter: parent.verticalCenter
            label: qsTr("Snap")
            shortcut: root.shortcut("toggleSnap")
            description: qsTr("Hold Alt while dragging to bypass")
            iconOnly: true
            iconName: "power"
            active: !!root.gestures && root.gestures.snapEnabled
            onClicked: if (root.gestures) root.gestures.snapEnabled = !root.gestures.snapEnabled
        }
        Ui.Select {
            objectName: "musicSnapSelect"
            anchors.verticalCenter: parent.verticalCenter
            density: Ui.EditorButton.Compact
            accessibleName: qsTr("Snap value")
            options: MusicSnap.options
            value: root.snapValue
            onValueCommitted: value => root.setSnapValue(value)
        }
        Ui.Text {
            visible: !root.compact
            anchors.verticalCenter: parent.verticalCenter
            text: qsTr("Drag:")
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
        }
        Ui.Select {
            objectName: "musicDragSelect"
            visible: !root.compact
            anchors.verticalCenter: parent.verticalCenter
            density: Ui.EditorButton.Compact
            accessibleName: qsTr("Drag mode")
            options: root.dragModes
            value: root.gestures ? root.gestures.dropMode : "overwrite"
            onValueCommitted: value => { if (root.gestures) root.gestures.dropMode = value }
        }
        ToolbarDivider { anchors.verticalCenter: parent.verticalCenter }
        Ui.Icon {
            anchors.verticalCenter: parent.verticalCenter
            visible: !root.compact
            name: "unfoldMore"
            tone: Ui.Text.Secondary
        }
        TrackHeightSlider {
            objectName: "musicVerticalZoom"
            anchors.verticalCenter: parent.verticalCenter
            width: Ui.Metrics.standard * 2
            viewState: root.viewState
            accessibleName: qsTr("Vertical zoom")
        }
        Ui.Icon {
            anchors.verticalCenter: parent.verticalCenter
            visible: !root.compact
            name: "swapHoriz"
            tone: Ui.Text.Secondary
        }
        Ui.Slider {
            id: horizontalZoom
            objectName: "musicHorizontalZoom"
            property real gestureBaseline: 0
            anchors.verticalCenter: parent.verticalCenter
            width: Ui.Metrics.standard * 2
            from: 0
            to: 100
            stepSize: 1
            value: root.viewState ? root.viewState.zoomSliderValue : 0
            onEditStarted: gestureBaseline = value
            onValuePreviewed: value => { if (root.viewState && root.clock) root.viewState.zoomFromSlider(value, root.clock.time) }
            onValueCommitted: value => { if (root.viewState && root.clock) root.viewState.zoomFromSlider(value, root.clock.time) }
            onEditCanceled: { if (root.viewState && root.clock) root.viewState.zoomFromSlider(gestureBaseline, root.clock.time) }
            accessibleName: qsTr("Horizontal zoom")
            density: Ui.EditorButton.Compact
        }
    }
}
