// Mirrors web/src/components/timeline/ToolToggle.tsx: the pointer tools in
// Premiere's Tools panel order (Select, Track select forward and backward,
// Ripple edit, Rolling edit, Rate stretch, Cut, Slip, Slide, Hand, Zoom), the
// Ripple toggle, the three drop modes as one exclusive group, Snap, Linked
// selection and Follow playhead. Labelled ghost buttons; `compact` shows
// icons only. Tempo controls plug into the toolbar slot after Snap.
import QtQuick
import NodeTool.Timeline

Row {
    id: tools
    objectName: "toolToggle"
    required property ClipGestureController gestures
    property TimelineModel timeline: null
    property TimelineViewState viewState: null
    property bool followPlayhead: true
    property bool compact: false
    spacing: 2                                          // gap 0.5 (theme spacing 4)

    // Glyphs after Premiere's: a bar with the direction each edit moves.
    readonly property string pointerGlyph: "M5 3.5 5 19.5 9.2 15.2 11.7 21 14.5 19.8 12 14.2 18 14.2 Z"
    readonly property var editTools: [
        { tool: "trackSelect", action: "trackSelectTool", label: "Track select",
          description: "Click to select every clip from there on. Shift: that track only",
          glyph: "M5 5 V19 M9 12 H20 M16 8 L20 12 L16 16 M9 7 H14 M9 17 H14" },
        { tool: "trackSelectBackward", action: "trackSelectBackwardTool", label: "Track select backward",
          description: "Click to select every clip up to there. Shift: that track only",
          glyph: "M19 5 V19 M15 12 H4 M8 8 L4 12 L8 16 M15 7 H10 M15 17 H10" },
        { tool: "ripple", action: "rippleTool", label: "Ripple edit",
          description: "Drag an edge. Later clips follow so no gap opens",
          glyph: "M8 5 V19 M8 5 H5 M8 19 H5 M11 12 H20 M16 8 L20 12 L16 16" },
        { tool: "roll", action: "rollTool", label: "Rolling edit",
          description: "Drag a cut. The clip across it gives up what this one gains",
          glyph: "M12 4 V20 M3 12 H21 M6 9 L3 12 L6 15 M18 9 L21 12 L18 15" },
        { tool: "rateStretch", action: "rateStretchTool", label: "Rate stretch",
          description: "Drag an edge. The clip's speed changes to fill the new length",
          glyph: "M3 6 V18 M21 6 V18 M6 12 H18 M9 9 L6 12 L9 15 M15 9 L18 12 L15 15" }
    ]
    readonly property var afterCutTools: [
        { tool: "slip", action: "slipTool", label: "Slip",
          description: "Drag a clip to change which part of its source plays",
          glyph: "M3 7 H21 V17 H3 Z M8 12 H16 M10 10 L8 12 L10 14 M14 10 L16 12 L14 14" },
        { tool: "slide", action: "slideTool", label: "Slide",
          description: "Drag a clip along its track. The clips on either side trim to follow",
          glyph: "M3 7 V17 M21 7 V17 M8 8 H16 V16 H8 Z M5 12 H8 M16 12 H19" },
        { tool: "hand", action: "handTool", label: "Hand",
          description: "Drag to scroll the timeline",
          glyph: "M8 13 V6.5 a1.5 1.5 0 0 1 3 0 V12 M11 11 V5 a1.5 1.5 0 0 1 3 0 V12 M14 11.5 V6.5 a1.5 1.5 0 0 1 3 0 V14 a6 6 0 0 1 -6 6 h-1 a6 6 0 0 1 -5 -2.7 L3.5 14 a1.5 1.5 0 0 1 2.4 -1.8 L8 14" },
        { tool: "zoom", action: "zoomTool", label: "Zoom",
          description: "Click to zoom in at that point. Alt-click zooms out",
          glyph: "M10.5 4 a6.5 6.5 0 1 0 0.01 0 Z M15.2 15.2 L20 20 M8 10.5 H13 M10.5 8 V13" }
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
        iconPath: tools.pointerGlyph
        glyph: true
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
            iconPath: modelData.glyph
            glyph: true
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
        iconPath: Icons.contentCut
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
            iconPath: modelData.glyph
            glyph: true
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
        iconPath: Icons.swapHoriz
        onClicked: tools.gestures.rippleMode = !tools.gestures.rippleMode
    }
    ToolbarDivider { anchors.verticalCenter: parent.verticalCenter }
    // Drop mode: one exclusive choice (a radio group).
    Row {
        objectName: "dropModeGroup"
        anchors.verticalCenter: parent.verticalCenter
        spacing: 2
        Accessible.role: Accessible.RadioButton
        Accessible.name: "Drop mode"
        Repeater {
            model: [
                { mode: "overwrite", label: "Overwrite", description: "A drop replaces what it covers", icon: Icons.flipToFront },
                { mode: "insert", label: "Insert", description: "A drop pushes later clips right (or Ctrl+drag in any mode)", icon: Icons.keyboardTab },
                { mode: "overlap", label: "Overlap", description: "A drop stacks and cross-fades", icon: Icons.layers }
            ]
            delegate: ToolButton {
                required property var modelData
                objectName: "dropMode_" + modelData.mode
                anchors.verticalCenter: parent.verticalCenter
                label: modelData.label
                description: modelData.description
                active: tools.gestures.dropMode === modelData.mode
                compact: tools.compact
                iconPath: modelData.icon
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
        iconPath: Icons.gridGoldenratio
        onClicked: tools.gestures.snapEnabled = !tools.gestures.snapEnabled
    }
    SlotItems {
        anchors.verticalCenter: parent.verticalCenter
        slot: "toolbar"
        slotProperties: ({ timeline: tools.timeline, gestures: tools.gestures,
                           viewState: tools.viewState })
    }
    ToolbarDivider { anchors.verticalCenter: parent.verticalCenter }
    ToolButton {
        objectName: "linkedToggle"
        anchors.verticalCenter: parent.verticalCenter
        label: "Linked"
        description: "Video and its audio move together"
        active: tools.gestures.linkedSelection
        compact: tools.compact
        iconPath: tools.gestures.linkedSelection ? Icons.link : Icons.linkOff
        onClicked: tools.gestures.linkedSelection = !tools.gestures.linkedSelection
    }
    ToolButton {
        objectName: "followToggle"
        anchors.verticalCenter: parent.verticalCenter
        label: "Follow"
        description: "The tracks scroll to keep the playhead in view during playback"
        active: tools.followPlayhead
        compact: tools.compact
        iconPath: Icons.myLocation
        onClicked: tools.followPlayhead = !tools.followPlayhead
    }
}
