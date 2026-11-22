// The piano roll's one-row toolbar (Logic-style): the Edit, Functions and View menus, the
// Collapse, MIDI Draw, Catch and Link toggles, the two tool menus, the position display, Snap,
// the drag mode and the two zoom sliders. It holds no state: every control reads and writes the
// PianoRollPanel it is given. UI thread only.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.UiPrimitives as Ui
import "PianoRollTools.js" as Tools

Item {
    id: root
    objectName: "pianoRollToolbar"
    required property var panel
    readonly property bool mac: Qt.platform.os === "osx"
    readonly property string modifier: mac ? "Cmd+" : "Ctrl+"
    readonly property bool hasSelection: panel.selectedIds.length > 0
    implicitHeight: Ui.Metrics.standard

    readonly property var editEntries: [
        {id: "undo", label: qsTr("Undo"), shortcut: modifier + "Z", enabled: panel.canUndo},
        {id: "redo", label: qsTr("Redo"), shortcut: mac ? "Cmd+Shift+Z" : "Ctrl+Y", enabled: panel.canRedo},
        {separator: true},
        {id: "cut", label: qsTr("Cut"), shortcut: modifier + "X", enabled: panel.controllerEditable && hasSelection},
        {id: "copy", label: qsTr("Copy"), shortcut: modifier + "C", enabled: hasSelection},
        {id: "paste", label: qsTr("Paste"), shortcut: modifier + "V", enabled: panel.controllerEditable && panel.clipboard.length > 0},
        {id: "delete", label: qsTr("Delete"), shortcut: "Delete", enabled: panel.controllerEditable && hasSelection},
        {separator: true},
        {id: "selectAll", label: qsTr("Select All"), shortcut: modifier + "A"},
        {id: "deselectAll", label: qsTr("Deselect All"), shortcut: "Esc", enabled: hasSelection},
        {id: "selectFollowing", label: qsTr("Select All Following")},
        {id: "selectSamePitch", label: qsTr("Select Same Pitch"), enabled: hasSelection},
        {id: "selectMuted", label: qsTr("Select Muted Notes")},
        {id: "invertSelection", label: qsTr("Invert Selection")}
    ]
    readonly property var functionEntries: [
        {id: "quantize", label: qsTr("Quantize"), shortcut: "Q", enabled: panel.controllerEditable},
        {id: "quantizeLength", label: qsTr("Quantize Starts and Lengths"), enabled: panel.controllerEditable},
        {id: "scaleQuantize", label: qsTr("Scale Quantize"), enabled: panel.controllerEditable && panel.scaleActive},
        {separator: true},
        {id: "transposeUp", label: qsTr("Transpose Semitone Up"), shortcut: "Up", enabled: panel.controllerEditable && hasSelection},
        {id: "transposeDown", label: qsTr("Transpose Semitone Down"), shortcut: "Down", enabled: panel.controllerEditable && hasSelection},
        {id: "octaveUp", label: qsTr("Transpose Octave Up"), shortcut: "Shift+Up", enabled: panel.controllerEditable && hasSelection},
        {id: "octaveDown", label: qsTr("Transpose Octave Down"), shortcut: "Shift+Down", enabled: panel.controllerEditable && hasSelection},
        {separator: true},
        {id: "forceLegato", label: qsTr("Force Legato"), enabled: panel.controllerEditable && hasSelection},
        {id: "removeOverlaps", label: qsTr("Remove Overlaps"), enabled: panel.controllerEditable && hasSelection},
        {id: "deleteDuplicates", label: qsTr("Delete Duplicates"), enabled: panel.controllerEditable && hasSelection},
        {separator: true},
        {id: "mute", label: qsTr("Mute/Unmute"), shortcut: "M", enabled: panel.controllerEditable && hasSelection}
    ]
    readonly property var viewEntries: [
        {id: "inspector", label: qsTr("Local Inspector"), checked: panel.inspectorVisible},
        {id: "draw", label: qsTr("MIDI Draw"), checked: panel.drawVisible},
        {id: "collapse", label: qsTr("Collapse Mode"), checked: panel.collapseMode},
        {id: "catch", label: qsTr("Catch Playhead"), checked: panel.catchOn},
        {id: "link", label: qsTr("Link"), checked: panel.linkOn},
        {separator: true},
        {id: "noteColor", label: qsTr("Note Color"), submenu: [
            {id: "noteColorVelocity", label: qsTr("Velocity"), checked: panel.noteColorMode === "velocity"},
            {id: "noteColorClip", label: qsTr("Clip"), checked: panel.noteColorMode === "clip"}]},
        {separator: true},
        {id: "zoomFit", label: qsTr("Zoom to Fit")}
    ]
    function toolEntries(prefix, current) {
        return Tools.TOOLS.map(entry => ({id: prefix + entry.tool, label: qsTr(entry.label), icon: entry.icon, checked: entry.tool === current}))
    }
    readonly property var dragEntries: [
        {id: "dragOverlap", label: qsTr("Overlap"), checked: panel.dragMode === "overlap"},
        {id: "dragNoOverlap", label: qsTr("No Overlap"), checked: panel.dragMode === "nooverlap"}
    ]

    Rectangle {
        anchors.fill: parent
        color: Ui.Theme.surfacePanel
    }
    Ui.Separator { anchors { left: parent.left; right: parent.right; bottom: parent.bottom } }

    Flickable {
        anchors.fill: parent
        contentWidth: row.width
        contentHeight: height
        flickableDirection: Flickable.HorizontalFlick
        boundsBehavior: Flickable.StopAtBounds
        clip: true
        Row {
            id: row
            height: parent.height
            leftPadding: Ui.Metrics.md
            rightPadding: Ui.Metrics.md
            spacing: Ui.Metrics.sm

            component MenuTrigger: Ui.MenuButton {
                anchors.verticalCenter: parent.verticalCenter
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
            }
            component Toggle: Ui.ToolbarIconButton {
                property bool lit: false
                property var tint: undefined
                anchors.verticalCenter: parent.verticalCenter
                active: lit
                iconColor: lit ? tint : undefined
            }

            MenuTrigger {
                objectName: "pianoRollEditMenuButton"
                text: qsTr("Edit")
                menu: editMenu
                Ui.ContextMenu {
                    id: editMenu
                    objectName: "pianoRollEditMenu"
                    entries: root.editEntries
                    onEntryTriggered: id => root.panel.runAction(id)
                }
            }
            MenuTrigger {
                objectName: "pianoRollFunctionsMenuButton"
                text: qsTr("Functions")
                menu: functionsMenu
                Ui.ContextMenu {
                    id: functionsMenu
                    objectName: "pianoRollFunctionsMenu"
                    entries: root.functionEntries
                    onEntryTriggered: id => root.panel.runAction(id)
                }
            }
            MenuTrigger {
                objectName: "pianoRollViewMenuButton"
                text: qsTr("View")
                menu: viewMenu
                Ui.ContextMenu {
                    id: viewMenu
                    objectName: "pianoRollViewMenu"
                    entries: root.viewEntries
                    onEntryTriggered: id => root.panel.runAction(id)
                }
            }
            Ui.Separator { anchors.verticalCenter: parent.verticalCenter; orientation: Qt.Vertical; height: Ui.Metrics.xl }
            Toggle {
                objectName: "pianoRollCollapse"
                iconName: "unfoldLess"
                accessibleName: qsTr("Collapse Mode")
                lit: root.panel.collapseMode
                tint: Ui.Theme.accentPrimary
                onClicked: root.panel.collapseMode = !root.panel.collapseMode
            }
            Toggle {
                objectName: "pianoRollDrawToggle"
                iconName: "showChart"
                accessibleName: qsTr("MIDI Draw")
                lit: root.panel.drawVisible
                tint: Ui.Theme.accentPrimary
                onClicked: root.panel.drawVisible = !root.panel.drawVisible
            }
            Toggle {
                objectName: "pianoRollCatch"
                iconName: "myLocation"
                accessibleName: qsTr("Catch")
                lit: root.panel.catchOn
                tint: Ui.Theme.statusInfo
                onClicked: root.panel.catchOn = !root.panel.catchOn
            }
            Toggle {
                objectName: "pianoRollLink"
                iconName: "link"
                accessibleName: qsTr("Link")
                lit: root.panel.linkOn
                tint: Ui.Theme.statusWarning
                onClicked: root.panel.linkOn = !root.panel.linkOn
            }
            Ui.Separator { anchors.verticalCenter: parent.verticalCenter; orientation: Qt.Vertical; height: Ui.Metrics.xl }
            MenuTrigger {
                objectName: "pianoRollToolMenuButton"
                iconName: Tools.toolInfo(root.panel.tool).icon
                accessibleName: qsTr("Left-click tool: %1").arg(qsTr(Tools.toolInfo(root.panel.tool).label))
                menu: toolMenu
                Ui.ContextMenu {
                    id: toolMenu
                    objectName: "pianoRollToolMenu"
                    entries: root.toolEntries("tool:", root.panel.tool)
                    onEntryTriggered: id => root.panel.tool = id.substring(5)
                }
            }
            MenuTrigger {
                objectName: "pianoRollAltToolMenuButton"
                iconName: Tools.toolInfo(root.panel.altTool).icon
                accessibleName: qsTr("%1-click tool: %2").arg(root.mac ? qsTr("Cmd") : qsTr("Ctrl")).arg(qsTr(Tools.toolInfo(root.panel.altTool).label))
                menu: altToolMenu
                Ui.ContextMenu {
                    id: altToolMenu
                    objectName: "pianoRollAltToolMenu"
                    entries: root.toolEntries("alt:", root.panel.altTool)
                    onEntryTriggered: id => root.panel.altTool = id.substring(4)
                }
            }
            Ui.Separator { anchors.verticalCenter: parent.verticalCenter; orientation: Qt.Vertical; height: Ui.Metrics.xl }
            Ui.Text {
                objectName: "pianoRollPosition"
                anchors.verticalCenter: parent.verticalCenter
                width: Ui.Metrics.xxxl * 4.5
                role: Ui.Typography.MonoLabel
                text: root.panel.positionText
                elide: Text.ElideRight
            }
            Ui.Text {
                anchors.verticalCenter: parent.verticalCenter
                role: Ui.Typography.SansLabel
                tone: Ui.Text.Secondary
                text: qsTr("Snap:")
            }
            Toggle {
                objectName: "pianoRollSnapPower"
                iconName: "power"
                accessibleName: qsTr("Snap")
                lit: root.panel.snapOn
                tint: Ui.Theme.accentPrimary
                onClicked: root.panel.snapOn = !root.panel.snapOn
            }
            Ui.Select {
                objectName: "pianoRollSnapSelect"
                anchors.verticalCenter: parent.verticalCenter
                density: Ui.EditorButton.Compact
                accessibleName: qsTr("Snap value")
                options: Tools.SNAP_OPTIONS
                value: root.panel.snapValue
                onValueCommitted: next => root.panel.snapValue = next
            }
            MenuTrigger {
                objectName: "pianoRollDragMenuButton"
                iconName: "swapHoriz"
                accessibleName: qsTr("Drag mode")
                menu: dragMenu
                Ui.ContextMenu {
                    id: dragMenu
                    objectName: "pianoRollDragMenu"
                    entries: root.dragEntries
                    onEntryTriggered: id => root.panel.dragMode = id === "dragOverlap" ? "overlap" : "nooverlap"
                }
            }
            Ui.Separator { anchors.verticalCenter: parent.verticalCenter; orientation: Qt.Vertical; height: Ui.Metrics.xl }
            Ui.Icon {
                anchors.verticalCenter: parent.verticalCenter
                name: "unfoldMore"
                tone: Ui.Text.Secondary
            }
            Ui.Slider {
                objectName: "pianoRollVerticalZoom"
                anchors.verticalCenter: parent.verticalCenter
                width: Ui.Metrics.xxxl * 3
                density: Ui.EditorButton.Compact
                accessibleName: qsTr("Vertical zoom")
                from: 0.5
                to: 2
                origin: 1
                resetValue: 1
                resetOnDoubleTap: true
                value: root.panel.rowZoom
                onValuePreviewed: next => root.panel.rowZoom = next
                onValueCommitted: next => root.panel.rowZoom = next
            }
            Ui.Icon {
                anchors.verticalCenter: parent.verticalCenter
                name: "swapHoriz"
                tone: Ui.Text.Secondary
            }
            Ui.Slider {
                objectName: "pianoRollHorizontalZoom"
                anchors.verticalCenter: parent.verticalCenter
                width: Ui.Metrics.xxxl * 3
                density: Ui.EditorButton.Compact
                accessibleName: qsTr("Horizontal zoom")
                from: 0
                to: 1
                value: Tools.zoomToSlider(root.panel.pxPerTick, root.panel.minPxPerTick, root.panel.maxPxPerTick)
                onValuePreviewed: next => root.panel.setZoomFromSlider(next)
                onValueCommitted: next => root.panel.setZoomFromSlider(next)
            }
        }
    }
}
