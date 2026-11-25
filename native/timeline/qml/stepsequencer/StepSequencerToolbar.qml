// The Step Sequencer menu bar (SQ28, figure p0724), left to right: Edit,
// Functions and View menus, the Pattern Browser and Inspector toggles, MIDI Out,
// Mono Mode, the edit mode selector (On/Off plus the mode select), then the
// vertical zoom slider and the Step Width buttons. Stateless: the panel owns
// every value. UI thread only.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.UiPrimitives as Ui
import "StepSequencerModes.js" as Modes

Rectangle {
    id: root
    required property var panel
    color: Ui.Theme.surfacePanel
    readonly property bool mac: Qt.platform.os === "osx"
    readonly property bool editable: panel.editable
    readonly property bool hasRow: panel.selectedRowId !== ""
    readonly property bool hasSteps: panel.selectedSteps.length > 0
    readonly property bool hasUnused: panel.rows.some(r => !r.steps.some(s => s.on))
    function key(text) { return mac ? text : text.replace("⌃", "Ctrl+Alt+").replace("⌘", "Ctrl+").replace("⌥", "Alt+").replace("⇧", "Shift+") }
    readonly property var editEntries: [
        {id: "undo", label: qsTr("Undo"), shortcut: key("⌘Z"), enabled: !!panel.undoStack && panel.undoStack.canUndo},
        {id: "redo", label: qsTr("Redo"), shortcut: key("⇧⌘Z"), enabled: !!panel.undoStack && panel.undoStack.canRedo},
        {separator: true},
        {id: "cutSteps", label: qsTr("Cut Steps"), shortcut: key("⌘X"), enabled: editable && hasSteps},
        {id: "copySteps", label: qsTr("Copy Steps"), shortcut: key("⌘C"), enabled: hasSteps},
        {id: "pasteSteps", label: qsTr("Paste Steps"), shortcut: key("⌘V"), enabled: editable && hasRow && !!panel.clipboard && panel.clipboard.kind === "steps"},
        {id: "repeatStep", label: qsTr("Repeat Step"), shortcut: key("⌘R"), enabled: editable && hasSteps},
        {id: "toggleStep", label: qsTr("Toggle Step"), shortcut: "'", enabled: editable && hasSteps},
        {id: "clearStep", label: qsTr("Clear Step"), shortcut: key("⌃⌫"), enabled: editable && hasSteps},
        {separator: true},
        {id: "copyRow", label: qsTr("Copy Row"), shortcut: key("⌃C"), enabled: hasRow},
        {id: "pasteRow", label: qsTr("Paste Row"), shortcut: key("⌃V"), enabled: editable && hasRow && !!panel.clipboard && panel.clipboard.kind === "row"},
        {id: "pasteNewRow", label: qsTr("Paste to New Row"), shortcut: key("⌃⇧V"), enabled: editable && !!panel.clipboard && panel.clipboard.kind === "row"},
        {id: "pasteRowSettings", label: qsTr("Paste Row Settings"), shortcut: key("⌃⌥⇧V"), enabled: editable && hasRow && !!panel.clipboard && panel.clipboard.kind === "row"},
        {id: "duplicateRowNext", label: qsTr("Duplicate Row with Next Assignment"), shortcut: key("⌘D"), enabled: editable && hasRow},
        {id: "renameRow", label: qsTr("Rename Row"), shortcut: key("⇧↩"), enabled: editable && hasRow},
        {id: "muteRow", label: qsTr("Mute Row"), shortcut: key("⌃⇧M"), enabled: editable && hasRow},
        {id: "soloRow", label: qsTr("Solo Row"), shortcut: key("⌃⇧S"), enabled: editable && hasRow},
        {id: "deleteRow", label: qsTr("Delete Row"), shortcut: key("⌘⌫"), enabled: editable && hasRow},
        {id: "deleteUnused", label: qsTr("Delete Unused Rows"), shortcut: key("⇧⌘⌫"), enabled: editable && hasUnused},
        {id: "clearRow", label: qsTr("Clear Row"), shortcut: key("⌃⌘⌫"), enabled: editable && hasRow},
        {id: "clearRowMode", label: qsTr("Clear Current Mode for Row"), shortcut: key("⌥⌘⌫"), enabled: editable && hasRow},
        {separator: true},
        {id: "clearPattern", label: qsTr("Clear Pattern"), shortcut: key("⌃⇧⌘⌫"), enabled: editable},
        {id: "clearPatternMode", label: qsTr("Clear Current Mode for All Rows"), shortcut: key("⌥⇧⌘⌫"), enabled: editable}
    ]
    readonly property var functionEntries: [
        {id: "rotatePatternLeft", label: qsTr("Rotate Pattern Left"), shortcut: key("⌃⌥⌘←"), enabled: editable},
        {id: "rotatePatternRight", label: qsTr("Rotate Pattern Right"), shortcut: key("⌃⌥⌘→"), enabled: editable},
        {id: "rotateRowLeft", label: qsTr("Rotate Row Left"), shortcut: key("⌥⌘←"), enabled: editable && hasRow},
        {id: "rotateRowRight", label: qsTr("Rotate Row Right"), shortcut: key("⌥⌘→"), enabled: editable && hasRow},
        {id: "rotateModeLeft", label: qsTr("Rotate Current Mode Values Left"), shortcut: key("⌥⇧←"), enabled: editable && hasRow},
        {id: "rotateModeRight", label: qsTr("Rotate Current Mode Values Right"), shortcut: key("⌥⇧→"), enabled: editable && hasRow},
        {separator: true},
        {id: "randomizeRows", label: qsTr("Randomize Selected Rows"), shortcut: key("⇧⌘R"), enabled: editable && hasRow},
        {id: "randomizeAll", label: qsTr("Randomize All Rows"), shortcut: key("⌥⌘R"), enabled: editable},
        {id: "randomizeSteps", label: qsTr("Randomize Selected Steps"), shortcut: key("⌥⇧⌘R"), enabled: editable && hasSteps},
        {id: "newSeed", label: qsTr("New Random Seed"), enabled: editable},
        {separator: true},
        {id: "transposeUp", label: qsTr("Transpose +1 Semitone"), shortcut: key("⌥↑"), enabled: editable},
        {id: "transposeDown", label: qsTr("Transpose -1 Semitone"), shortcut: key("⌥↓"), enabled: editable},
        {id: "transposeOctaveUp", label: qsTr("Transpose +1 Octave"), shortcut: key("⌥⇧↑"), enabled: editable},
        {id: "transposeOctaveDown", label: qsTr("Transpose -1 Octave"), shortcut: key("⌥⇧↓"), enabled: editable},
        {separator: true},
        {id: "patternRateUp", label: qsTr("Pattern Step Rate Faster"), shortcut: key("⌃⇧="), enabled: editable},
        {id: "patternRateDown", label: qsTr("Pattern Step Rate Slower"), shortcut: key("⌃⇧-"), enabled: editable},
        {id: "rowRateUp", label: qsTr("Row Step Rate Faster"), shortcut: key("⌃="), enabled: editable && hasRow},
        {id: "rowRateDown", label: qsTr("Row Step Rate Slower"), shortcut: key("⌃-"), enabled: editable && hasRow},
        {id: "loopStartUp", label: qsTr("Row Loop Start Later"), shortcut: key("⌃⌥="), enabled: editable && hasRow},
        {id: "loopStartDown", label: qsTr("Row Loop Start Earlier"), shortcut: key("⌃⌥-"), enabled: editable && hasRow},
        {id: "loopEndUp", label: qsTr("Row Loop End Later"), shortcut: key("⌥⌘="), enabled: editable && hasRow},
        {id: "loopEndDown", label: qsTr("Row Loop End Earlier"), shortcut: key("⌥⌘-"), enabled: editable && hasRow},
        {separator: true},
        {id: "mono", label: qsTr("Mono Mode"), shortcut: key("⌃⇧⌘M"), checked: !!panel.settings.mono, enabled: editable},
        {id: "convertToMidi", label: qsTr("Convert to MIDI Region"), enabled: editable}
    ]
    readonly property var viewEntries: [
        {id: "displayValues", label: qsTr("Display Edit Mode Values"), submenu: [
            {id: "valuesEditing", label: qsTr("Only When Editing"), checked: panel.displayValues === "editing"},
            {id: "valuesSelected", label: qsTr("Always for Selected Row"), checked: panel.displayValues === "selected"},
            {id: "valuesAll", label: qsTr("Always for All Rows"), checked: panel.displayValues === "all"}
        ]},
        {id: "sortRows", label: qsTr("Sort Rows"), enabled: editable, submenu: [
            {id: "sort:none", label: qsTr("Manual Order")},
            {id: "sort:typeAsc", label: qsTr("By Type, Ascending")},
            {id: "sort:typeDesc", label: qsTr("By Type, Descending")},
            {id: "sort:typeAndNoteAsc", label: qsTr("By Type and Note, Ascending")},
            {id: "sort:typeAndNoteDesc", label: qsTr("By Type and Note, Descending")},
            {id: "sort:typeAndNameAsc", label: qsTr("By Type and Name, Ascending")},
            {id: "sort:typeAndNameDesc", label: qsTr("By Type and Name, Descending")},
            {id: "sort:typeAndKitPadAsc", label: qsTr("By Type and Kit Pad, Ascending")},
            {id: "sort:typeAndKitPadDesc", label: qsTr("By Type and Kit Pad, Descending")}
        ]},
        {id: "expandRow", label: qsTr("Show Subrows for Row"), shortcut: key("⌃⌘→"), enabled: hasRow},
        {id: "collapseRow", label: qsTr("Hide Subrows for Row"), shortcut: key("⌃⌘←"), enabled: hasRow},
        {id: "expandAll", label: qsTr("Show Subrows for All Rows"), shortcut: key("⌃⇧⌘→"), enabled: panel.rows.length > 0},
        {id: "collapseAll", label: qsTr("Hide Subrows for All Rows"), shortcut: key("⌃⇧⌘←"), enabled: panel.rows.length > 0},
        {separator: true},
        {id: "rowColors", label: qsTr("Show Row Colors"), checked: panel.rowColors},
        {id: "inspector", label: qsTr("Show Local Inspector"), checked: panel.inspectorVisible},
        {id: "browser", label: qsTr("Show Pattern Browser"), shortcut: key("⌥⇧B"), checked: panel.browserVisible},
        {id: "link", label: qsTr("Link"), checked: panel.linkOn}
    ]

    Row {
        id: left
        height: parent.height
        spacing: Ui.Metrics.xs
        leftPadding: Ui.Metrics.md
        Trigger { text: qsTr("Edit"); objectName: "stepSequencerEditMenu"; menu: editMenu
            Ui.ContextMenu { id: editMenu; entries: root.editEntries; onEntryTriggered: id => root.panel.runAction(id) } }
        Trigger { text: qsTr("Functions"); objectName: "stepSequencerFunctionsMenu"; menu: functionsMenu
            Ui.ContextMenu { id: functionsMenu; entries: root.functionEntries; onEntryTriggered: id => root.panel.runAction(id) } }
        Trigger { text: qsTr("View"); objectName: "stepSequencerViewMenu"; menu: viewMenu
            Ui.ContextMenu { id: viewMenu; entries: root.viewEntries; onEntryTriggered: id => root.panel.runAction(id) } }
        Divider {}
        Icon { objectName: "stepSequencerBrowserToggle"; iconName: "queueMusic"; tip: qsTr("Pattern Browser"); active: root.panel.browserVisible; onClicked: root.panel.runAction("browser") }
        Icon { objectName: "stepSequencerInspectorToggle"; iconName: "tune"; tip: qsTr("Inspector"); active: root.panel.inspectorVisible; onClicked: root.panel.runAction("inspector") }
        Divider {}
        Icon { objectName: "stepSequencerMidiOut"; iconName: root.panel.midiOut ? "volumeUpOutlined" : "volumeOffOutlined"; tip: qsTr("MIDI Out"); active: root.panel.midiOut; iconColor: active ? Ui.Theme.statusSuccess : undefined; onClicked: root.panel.midiOut = !root.panel.midiOut }
        Icon { objectName: "stepSequencerMono"; iconName: "filterCenterFocus"; tip: qsTr("Mono Mode"); active: !!root.panel.settings.mono; enabled: root.editable; onClicked: root.panel.runAction("mono") }
        Divider {}
        Ui.EditorButton {
            objectName: "stepSequencerOnOff"
            anchors.verticalCenter: parent.verticalCenter
            density: Ui.EditorButton.Compact
            variant: root.panel.editMode === "onOff" ? Ui.EditorButton.Primary : Ui.EditorButton.Default
            text: qsTr("On/Off")
            accessibleName: qsTr("On/Off Mode")
            description: root.key("⌃⌥S")
            width: Ui.Metrics.xxxl * 2.4
            onClicked: root.panel.editMode = "onOff"
        }
        Ui.Select {
            objectName: "stepSequencerModeSelect"
            anchors.verticalCenter: parent.verticalCenter
            width: Ui.Metrics.xxxl * 4.4
            density: Ui.EditorButton.Compact
            accessibleName: qsTr("Edit Mode")
            options: Modes.MODES.filter(m => m.value !== "onOff").map(m => ({label: m.label, value: m.value}))
            value: root.panel.editMode === "onOff" ? root.panel.lastValueMode : (root.panel.editMode === "value" ? "velocity" : root.panel.editMode)
            onValueCommitted: next => root.panel.editMode = next
        }
    }
    Row {
        anchors.right: parent.right
        height: parent.height
        spacing: Ui.Metrics.xs
        rightPadding: Ui.Metrics.md
        Ui.Icon { anchors.verticalCenter: parent.verticalCenter; name: "unfoldMore"; tone: Ui.Text.Secondary; size: Ui.Metrics.iconSm }
        Ui.Slider {
            objectName: "stepSequencerZoom"
            anchors.verticalCenter: parent.verticalCenter
            width: Ui.Metrics.xxxl * 2.2
            density: Ui.EditorButton.Compact
            accessibleName: qsTr("Vertical Zoom")
            from: 0.6
            to: 2
            value: root.panel.rowZoom
            onValuePreviewed: value => root.panel.rowZoom = value
            onValueCommitted: value => root.panel.rowZoom = value
        }
        Divider {}
        Icon { objectName: "stepSequencerStepWidthMin"; iconName: "viewColumn"; tip: qsTr("Fit All Steps"); active: !root.panel.wideSteps; onClicked: root.panel.wideSteps = false }
        Icon { objectName: "stepSequencerStepWidthMax"; iconName: "fitScreen"; tip: qsTr("One Page of Steps"); active: root.panel.wideSteps; onClicked: root.panel.wideSteps = true }
    }
    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: Ui.Metrics.border; color: Ui.Theme.borderSubtle }

    component Trigger: Ui.MenuButton {
        anchors.verticalCenter: parent.verticalCenter
        density: Ui.EditorButton.Compact
        variant: Ui.EditorButton.Flat
    }
    component Icon: Ui.ToolbarIconButton {
        property string tip: ""
        anchors.verticalCenter: parent.verticalCenter
        accessibleName: tip
        description: tip
    }
    component Divider: Rectangle {
        anchors.verticalCenter: parent.verticalCenter
        width: Ui.Metrics.border
        height: Ui.Metrics.iconLg
        color: Ui.Theme.borderSubtle
    }
}
