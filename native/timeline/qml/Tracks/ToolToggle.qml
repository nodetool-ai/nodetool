// Mirrors web/src/components/timeline/ToolToggle.tsx: the pointer tools in
// Premiere's Tools panel order (Select, Track select forward and backward,
// Ripple edit, Rolling edit, Rate stretch, Cut, Slip, Slide, Hand, Zoom), the
// Ripple toggle, the three drop modes as one exclusive group, Snap, Linked
// selection and Follow playhead. Labelled ghost buttons; `compact` shows
// icons only. Tempo controls plug into the toolbar slot after Snap.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Row {
    id: tools
    objectName: "toolToggle"
    required property ClipGestureController gestures
    property TimelineModel timeline: null
    property TimelineViewState viewState: null
    property bool followPlayhead: true
    property bool compact: false
    spacing: Ui.Metrics.micro

    readonly property var editTools: [
        { tool: "trackSelect", action: "trackSelectTool", label: "Track select",
          description: "Click to select every clip from there on. Shift: that track only",
          icon: "toolTrackSelect" },
        { tool: "trackSelectBackward", action: "trackSelectBackwardTool", label: "Track select backward",
          description: "Click to select every clip up to there. Shift: that track only",
          icon: "toolTrackSelectBackward" },
        { tool: "ripple", action: "rippleTool", label: "Ripple edit",
          description: "Drag an edge. Later clips follow so no gap opens",
          icon: "toolRipple" },
        { tool: "roll", action: "rollTool", label: "Rolling edit",
          description: "Drag a cut. The clip across it gives up what this one gains",
          icon: "toolRoll" },
        { tool: "rateStretch", action: "rateStretchTool", label: "Rate stretch",
          description: "Drag an edge. The clip's speed changes to fill the new length",
          icon: "toolRateStretch" }
    ]
    readonly property var afterCutTools: [
        { tool: "slip", action: "slipTool", label: "Slip",
          description: "Drag a clip to change which part of its source plays",
          icon: "toolSlip" },
        { tool: "slide", action: "slideTool", label: "Slide",
          description: "Drag a clip along its track. The clips on either side trim to follow",
          icon: "toolSlide" },
        { tool: "hand", action: "handTool", label: "Hand",
          description: "Drag to scroll the timeline",
          icon: "toolHand" },
        { tool: "zoom", action: "zoomTool", label: "Zoom",
          description: "Click to zoom in at that point. Alt-click zooms out",
          icon: "toolZoom" }
    ]
    // Re-read the shortcuts when the keyboard layout changes.
    function shortcut(action) {
        return tools.gestures.keyboardPreset !== "" ? tools.gestures.shortcutFor(action) : ""
    }

    ToolButton {
        objectName: "tool_select"
        anchors.verticalCenter: parent.verticalCenter
        label: "Select"
        shortcut: tools.shortcut("selectTool")
        active: tools.gestures.activeTool === "select"
        compact: tools.compact
        iconName: "toolSelect"
        onClicked: tools.gestures.activeTool = "select"
    }
    Repeater {
        model: tools.editTools
        delegate: ToolButton {
            required property var modelData
            objectName: "tool_" + modelData.tool
            anchors.verticalCenter: parent.verticalCenter
            label: modelData.label
            shortcut: tools.shortcut(modelData.action)
            description: modelData.description
            active: tools.gestures.activeTool === modelData.tool
            compact: tools.compact
            iconOnly: true
            iconName: modelData.icon
            onClicked: tools.gestures.activeTool = modelData.tool
        }
    }
    ToolButton {
        objectName: "tool_cut"
        anchors.verticalCenter: parent.verticalCenter
        label: "Cut"
        shortcut: tools.shortcut("cutTool")
        active: tools.gestures.activeTool === "cut"
        compact: tools.compact
        iconName: "contentCut"
        onClicked: tools.gestures.activeTool = "cut"
    }
    Repeater {
        model: tools.afterCutTools
        delegate: ToolButton {
            required property var modelData
            objectName: "tool_" + modelData.tool
            anchors.verticalCenter: parent.verticalCenter
            label: modelData.label
            shortcut: tools.shortcut(modelData.action)
            description: modelData.description
            active: tools.gestures.activeTool === modelData.tool
            compact: tools.compact
            iconOnly: true
            iconName: modelData.icon
            onClicked: tools.gestures.activeTool = modelData.tool
        }
    }
    ToolButton {
        objectName: "rippleToggle"
        anchors.verticalCenter: parent.verticalCenter
        label: "Ripple edit"
        description: "Trims and deletes close the gap"
        active: tools.gestures.rippleMode
        compact: tools.compact
        iconName: "swapHoriz"
        onClicked: tools.gestures.rippleMode = !tools.gestures.rippleMode
    }
    ToolbarDivider { anchors.verticalCenter: parent.verticalCenter }
    // Drop mode: one exclusive choice (a radio group).
    Row {
        objectName: "dropModeGroup"
        anchors.verticalCenter: parent.verticalCenter
        spacing: Ui.Metrics.micro
        Accessible.role: Accessible.RadioButton
        Accessible.name: "Drop mode"
        Repeater {
            model: [
                { mode: "overwrite", label: "Overwrite", description: "A drop replaces what it covers", icon: "flipToFront" },
                { mode: "insert", label: "Insert", description: "A drop pushes later clips right (or Ctrl+drag in any mode)", icon: "keyboardTab" },
                { mode: "overlap", label: "Overlap", description: "A drop stacks and cross-fades", icon: "layers" }
            ]
            delegate: ToolButton {
                required property var modelData
                objectName: "dropMode_" + modelData.mode
                anchors.verticalCenter: parent.verticalCenter
                label: modelData.label
                description: modelData.description
                active: tools.gestures.dropMode === modelData.mode
                compact: tools.compact
                iconName: modelData.icon
                onClicked: tools.gestures.dropMode = modelData.mode
            }
        }
    }
    ToolbarDivider { anchors.verticalCenter: parent.verticalCenter }
    ToolButton {
        objectName: "snapToggle"
        anchors.verticalCenter: parent.verticalCenter
        label: "Snap"
        shortcut: tools.shortcut("toggleSnap")
        description: "Hold Alt while dragging to bypass"
        active: tools.gestures.snapEnabled
        compact: tools.compact
        iconName: "gridGoldenratio"
        onClicked: tools.gestures.snapEnabled = !tools.gestures.snapEnabled
    }
    SlotItems {
        anchors.verticalCenter: parent.verticalCenter
        slot: "toolbar"
        slotProperties: ({ timeline: tools.timeline, gestures: tools.gestures,
                           viewState: tools.viewState, compact: tools.compact })
    }
    ToolbarDivider { anchors.verticalCenter: parent.verticalCenter }
    ToolButton {
        objectName: "linkedToggle"
        anchors.verticalCenter: parent.verticalCenter
        label: "Linked"
        description: "Video and its audio move together"
        active: tools.gestures.linkedSelection
        compact: tools.compact
        iconName: tools.gestures.linkedSelection ? "link" : "linkOff"
        onClicked: tools.gestures.linkedSelection = !tools.gestures.linkedSelection
    }
    ToolButton {
        objectName: "followToggle"
        anchors.verticalCenter: parent.verticalCenter
        label: "Follow"
        description: "The tracks scroll to keep the playhead in view during playback"
        active: tools.followPlayhead
        compact: tools.compact
        iconName: "myLocation"
        onClicked: tools.followPlayhead = !tools.followPlayhead
    }
}
