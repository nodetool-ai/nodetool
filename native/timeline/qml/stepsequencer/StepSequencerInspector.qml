// The Step Sequencer local inspector (SQ31, figure p0757): tabs Pattern, Row and
// Step. A field whose value differs across the selected steps shows `*`, and a
// change to it moves every selected step by the same amount (p. 754). Each
// commit is one operation, so one undo entry. UI thread only.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.UiPrimitives as Ui
import "StepSequencerModes.js" as Modes

Rectangle {
    id: root
    required property var panel
    color: Ui.Theme.surfacePanel
    clip: true
    readonly property var settings: panel.settings
    readonly property var row: panel.rowById(panel.selectedRowId)
    readonly property var steps: row ? panel.selectedSteps.filter(s => s.row === row.id).map(s => s.step) : []
    readonly property bool editable: panel.editable
    readonly property real labelWidth: width * 0.44
    readonly property var playbackOptions: Modes.PLAYBACK.map(p => ({label: p.label, value: p.value}))
    readonly property var noteNames: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    readonly property var scales: ["chromatic", "major", "minor", "dorian", "mixolydian", "phrygian", "lydian", "locrian", "harmMinor", "melMinor",
                                   "phrygDom", "lydDom", "locrian2", "altered", "wholeTone", "dimHW", "dimWH", "majPent", "minPent", "blues"]
    readonly property var rateOptions: Modes.STEP_RATES.map(r => ({label: r, value: r}))

    // The shared value of `mode` across the selected steps, or null when they differ.
    function shared(mode) {
        if (!row || !steps.length) return null
        const first = Modes.value(row, steps[0], mode)
        return steps.every(s => Modes.value(row, s, mode) === first) ? first : null
    }
    function stepField(field) {
        if (!row || !steps.length) return null
        const first = row.steps[steps[0]][field]
        return steps.every(s => row.steps[s][field] === first) ? first : null
    }
    function setSteps(values) {
        if (row && steps.length) panel.op("set_steps", {row: row.id, steps: Modes.oneBased(steps), values: values})
    }
    // Condition key: "always", "first", "last" or "<iteration>:<cycles>" (p. 757).
    readonly property var conditionOptions: {
        const out = [{label: qsTr("Always"), value: "always"}, {label: qsTr("First"), value: "first"}, {label: qsTr("Last"), value: "last"}]
        for (let c = 2; c <= 8; ++c) for (let i = 1; i <= c; ++i) out.push({label: i + ":" + c, value: i + ":" + c})
        return out
    }
    function conditionKey(cond) {
        if (!cond || !cond.type || cond.type === "always") return "always"
        return cond.type === "recurrence" ? cond.iteration + ":" + cond.cycles : cond.type
    }
    readonly property var sharedCondition: {
        if (!row || !steps.length) return null
        const first = conditionKey(row.steps[steps[0]].condition)
        return steps.every(s => conditionKey(row.steps[s].condition) === first) ? first : null
    }
    function setCondition(key) {
        const parts = String(key).split(":")
        setSteps({condition: parts.length === 2 ? {type: "recurrence", iteration: Number(parts[0]), cycles: Number(parts[1])} : {type: key}})
    }
    // Row assignment entries: the Add Row groups, applied to the selected row.
    readonly property var assignEntries: panel.sequencer.addRowGroups.map(g => ({
        id: "group-" + g.id, label: g.label,
        submenu: g.choices.map((c, i) => ({id: g.id + ":" + i, label: c.label}))
    }))
    function assignRow(spec) {
        const parts = spec.split(":")
        const group = panel.sequencer.addRowGroups.find(g => g.id === parts[0])
        const choice = group ? group.choices[Number(parts[1])] : null
        if (!choice || !row) return
        const args = {row: row.id, assignment: choice.assignment}
        if (choice.name) args.name = choice.name
        const list = []
        if (choice.assignment.type === "degree" && settings.pitchSource !== "chords") list.push({op: "set_pattern", args: {pitchSource: "chords"}})
        list.push({op: "set_pattern_row", args: args})
        panel.ops(list)
    }
    readonly property var colorOptions: [{label: qsTr("Automatic"), value: ""}].concat(Modes.ROW_PALETTE.map((c, i) => ({label: qsTr("Color %1").arg(i + 1), value: c})))
    function commitStep(mode, next) {
        if (!row || !steps.length) return
        const common = shared(mode)
        if (common === null) {
            // A relative change, limited so no step leaves the range; one undo entry.
            const r = Modes.range(row, mode)
            const vals = steps.map(s => Modes.value(row, s, mode))
            const delta = Math.max(r.min - Math.min.apply(null, vals), Math.min(r.max - Math.max.apply(null, vals), next))
            if (delta !== 0) panel.shiftSteps(row, steps, mode, delta)
        } else {
            setSteps(Modes.patch(mode, next))
        }
    }

    Ui.TabBar {
        id: tabs
        objectName: "stepSequencerInspectorTabs"
        x: Ui.Metrics.md
        y: Ui.Metrics.xs
        width: parent.width - Ui.Metrics.md * 2
        accessibleName: qsTr("Inspector")
        tabs: [{label: qsTr("Pattern"), value: "pattern"}, {label: qsTr("Row"), value: "row", enabled: !!root.row},
               {label: qsTr("Step"), value: "step", enabled: root.steps.length > 0}]
        value: root.panel.inspectorTab
        onValueCommitted: next => root.panel.inspectorTab = next
    }
    Flickable {
        y: tabs.y + tabs.height
        width: parent.width
        height: parent.height - y
        contentHeight: content.height + Ui.Metrics.lg
        boundsBehavior: Flickable.StopAtBounds
        clip: true
        Column {
            id: content
            x: Ui.Metrics.md
            y: Ui.Metrics.md
            width: parent.width - Ui.Metrics.md * 2
            spacing: Ui.Metrics.xs

            // ── Pattern (SQ2) ─────────────────────────────────────────────
            Loader {
                width: parent.width
                property bool loadedOnce: false
                readonly property bool showing: root.panel.inspectorVisible && (root.panel.inspectorTab === "pattern")
                onShowingChanged: if (showing) loadedOnce = true
                active: showing || loadedOnce
                visible: showing
                sourceComponent: Column {
                    width: parent.width
                    spacing: Ui.Metrics.xs
                    Header { text: qsTr("Pattern") }
                    SelectField { label: qsTr("Step Rate"); options: root.rateOptions; value: root.settings.stepRate; onCommit: v => root.panel.op("set_pattern", {stepRate: v}) }
                    SelectField { label: qsTr("Playback Mode"); options: root.playbackOptions; value: root.settings.playback; onCommit: v => root.panel.op("set_pattern", {playback: v}) }
                    NumberRow { objectName: "stepInspectorLength"; label: qsTr("Length"); value: root.settings.lengthSteps || 16; from: 1; to: 64; onCommit: v => root.panel.op("set_pattern", {lengthSteps: v}) }
                    NumberRow { label: qsTr("Swing"); unit: "%"; value: root.settings.swing || 0; from: 0; to: 100; onCommit: v => root.panel.op("set_pattern", {swing: v}) }
                    SelectField { label: qsTr("Swing Grid"); options: ["1/8", "1/16"].map(r => ({label: r, value: r})); value: root.settings.swingDivision; onCommit: v => root.panel.op("set_pattern", {swingDivision: v}) }
                    SwitchRow { label: qsTr("Legato"); checked: !!root.settings.legato; onCommit: v => root.panel.op("set_pattern", {legato: v}) }
                    SwitchRow { objectName: "stepInspectorMono"; label: qsTr("Mono Mode"); checked: !!root.settings.mono; onCommit: v => root.panel.op("set_pattern", {mono: v}) }
                    NumberRow { label: qsTr("MIDI Channel"); value: root.settings.midiChannel || 1; from: 1; to: 16; onCommit: v => root.panel.op("set_pattern", {midiChannel: v}) }
                    SelectField { label: qsTr("Automation"); options: [{label: qsTr("Latch"), value: "latch"}, {label: qsTr("Slide"), value: "slide"}]; value: root.settings.automationMode; onCommit: v => root.panel.op("set_pattern", {automationMode: v}) }
                    SelectField { label: qsTr("Pitch Source"); options: [{label: qsTr("Off"), value: "off"}, {label: qsTr("Key"), value: "key"}, {label: qsTr("Chord Track"), value: "chords"}]; value: root.settings.pitchSource; onCommit: v => root.panel.op("set_pattern", {pitchSource: v}) }
                    SwitchRow { label: qsTr("Scale Quantize"); checked: !!root.settings.scaleQuantize; onCommit: v => root.panel.op("set_pattern", {scaleQuantize: v}) }
                    SelectField { objectName: "stepInspectorKey"; label: qsTr("Key"); options: [{label: qsTr("None"), value: -1}].concat(root.noteNames.map((n, i) => ({label: n, value: i})))
                        value: root.settings.key ? root.settings.key.tonic : -1
                        onCommit: v => root.panel.op("set_pattern", {key: v < 0 ? null : {tonic: v, mode: root.settings.key ? root.settings.key.mode : "major"}}) }
                    SelectField { label: qsTr("Key Mode"); options: [{label: qsTr("Major"), value: "major"}, {label: qsTr("Minor"), value: "minor"}]
                        value: root.settings.key ? root.settings.key.mode : "major"
                        onCommit: v => { if (root.settings.key) root.panel.op("set_pattern", {key: {tonic: root.settings.key.tonic, mode: v}}) } }
                    SelectField { label: qsTr("Scale"); options: root.scales.map(x => ({label: x, value: x})); value: root.settings.scale || "chromatic"; onCommit: v => root.panel.op("set_pattern", {scale: v}) }
                    SwitchRow { label: qsTr("No Transpose"); checked: !!root.settings.noTranspose; onCommit: v => root.panel.op("set_pattern", {noTranspose: v}) }
                    NumberRow { label: qsTr("Loop Start"); value: (root.settings.loopStart || 0) + 1; from: 1; to: root.settings.lengthSteps || 64; onCommit: v => root.panel.op("set_pattern", {loopStart: v}) }
                    NumberRow { label: qsTr("Loop End"); value: root.settings.loopEnd || root.settings.lengthSteps || 16; from: 1; to: root.settings.lengthSteps || 64; onCommit: v => root.panel.op("set_pattern", {loopEnd: v}) }
                }
            }

            // ── Row (SQ3) ─────────────────────────────────────────────────
            Loader {
                width: parent.width
                property bool loadedOnce: false
                readonly property bool showing: root.panel.inspectorVisible && (root.panel.inspectorTab === "row" && !!root.row)
                onShowingChanged: if (showing) loadedOnce = true
                active: showing || loadedOnce
                visible: showing
                sourceComponent: Column {
                    width: parent.width
                    spacing: Ui.Metrics.xs
                    Header { text: root.row ? root.row.label : "" }
                    Row {
                        width: parent.width
                        height: Ui.Metrics.compact
                        Caption { text: qsTr("Assignment") }
                        Ui.MenuButton {
                            objectName: "stepInspectorAssignment"
                            width: parent.width - root.labelWidth
                            density: Ui.EditorButton.Compact
                            text: root.row ? root.row.label : ""
                            accessibleName: qsTr("Row Assignment")
                            enabled: root.editable
                            menuComponent: Component { Ui.ContextMenu { entries: root.assignEntries; onEntryTriggered: id => root.assignRow(id) } }
                        }
                    }
                    Row {
                        width: parent.width
                        height: Ui.Metrics.compact
                        Caption { text: qsTr("Name") }
                        Ui.TextField {
                            objectName: "stepInspectorRowName"
                            width: parent.width - root.labelWidth
                            density: Ui.EditorButton.Compact
                            accessibleName: qsTr("Row Name")
                            enabled: root.editable
                            value: root.row ? root.row.label : ""
                            onValueCommitted: next => { if (next.trim() !== "") root.panel.op("set_pattern_row", {row: root.row.id, name: next.trim()}) }
                        }
                    }
                    NumberRow { objectName: "stepInspectorPitch"; visible: !!root.row && (root.row.type === "note" || root.row.type === "melodic")
                        label: qsTr("Note"); value: root.row && root.row.assignment ? root.row.assignment.pitch || 0 : 0; from: 0; to: 127
                        onCommit: v => root.panel.op("set_pattern_row", {row: root.row.id, assignment: {type: root.row.type, pitch: v}}) }
                    NumberRow { visible: !!root.row && root.row.type === "kit"
                        label: qsTr("Kit Pad"); value: root.row && root.row.assignment ? (root.row.assignment.pad || 0) + 1 : 1; from: 1; to: 16
                        onCommit: v => root.panel.op("set_pattern_row", {row: root.row.id, assignment: {type: "kit", pad: v - 1}}) }
                    SelectField { objectName: "stepInspectorRowColor"; label: qsTr("Color"); options: root.colorOptions
                        value: root.row && root.row.color ? root.row.color : ""
                        onCommit: v => root.panel.op("set_pattern_row", {row: root.row.id, color: v === "" ? null : v}) }
                    SelectField { visible: !!root.row && root.row.type === "automation"; label: qsTr("Automation")
                        options: [{label: qsTr("Latch"), value: "latch"}, {label: qsTr("Slide"), value: "slide"}]
                        value: root.row ? root.row.automationMode || "latch" : "latch"
                        onCommit: v => root.panel.op("set_pattern_row", {row: root.row.id, automationMode: v}) }
                    SelectField { label: qsTr("Step Rate"); options: root.rateOptions; value: root.row ? root.row.stepRate : ""; onCommit: v => root.panel.op("set_pattern_row", {row: root.row.id, stepRate: v}) }
                    SelectField { label: qsTr("Playback Mode"); options: root.playbackOptions; value: root.row ? root.row.playback : ""; onCommit: v => root.panel.op("set_pattern_row", {row: root.row.id, playback: v}) }
                    NumberRow { label: qsTr("Length"); value: root.row ? root.row.lengthSteps : 16; from: 1; to: root.settings.lengthSteps || 64; onCommit: v => root.panel.op("set_pattern_row", {row: root.row.id, lengthSteps: v}) }
                    NumberRow { label: qsTr("Loop Start"); value: root.row ? root.row.loopStart + 1 : 1; from: 1; to: root.row ? root.row.lengthSteps : 64; onCommit: v => root.panel.op("set_pattern_row", {row: root.row.id, loopStart: v}) }
                    NumberRow { label: qsTr("Loop End"); value: root.row ? root.row.loopEnd : 16; from: 1; to: root.row ? root.row.lengthSteps : 64; onCommit: v => root.panel.op("set_pattern_row", {row: root.row.id, loopEnd: v}) }
                    NumberRow { label: qsTr("MIDI Channel"); value: root.row ? root.row.midiChannel || 1 : 1; from: 1; to: 16; onCommit: v => root.panel.op("set_pattern_row", {row: root.row.id, midiChannel: v}) }
                    SwitchRow { label: qsTr("Mute"); checked: !!root.row && !!root.row.mute; onCommit: v => root.panel.op("set_pattern_row", {row: root.row.id, mute: v}) }
                    SwitchRow { label: qsTr("Solo"); checked: !!root.row && !!root.row.solo; onCommit: v => root.panel.op("set_pattern_row", {row: root.row.id, solo: v}) }
                }
            }

            // ── Step (p. 757) ─────────────────────────────────────────────
            Loader {
                width: parent.width
                property bool loadedOnce: false
                readonly property bool showing: root.panel.inspectorVisible && (root.panel.inspectorTab === "step" && root.steps.length > 0)
                onShowingChanged: if (showing) loadedOnce = true
                active: showing || loadedOnce
                visible: showing
                sourceComponent: Column {
                    width: parent.width
                    spacing: Ui.Metrics.xs
                    Header { text: qsTr("Playback") }
                    SwitchRow { label: qsTr("On/Off"); checked: root.shared("onOff") === 1; mixed: root.shared("onOff") === null; onCommit: v => root.setSteps({on: v}) }
                    StepNumber { label: qsTr("Chance"); mode: "chance"; unit: "%"; from: 0; to: 100 }
                    SelectField { label: qsTr("Step Rate"); options: [{label: qsTr("Row"), value: ""}].concat(root.rateOptions); value: root.stepField("stepRate") === undefined ? "" : (root.stepField("stepRate") || ""); onCommit: v => root.setSteps({stepRate: v === "" ? null : v}) }
                    SelectField { objectName: "stepInspectorCondition"; label: qsTr("Condition"); options: root.conditionOptions
                        value: root.sharedCondition === null ? undefined : root.sharedCondition; onCommit: v => root.setCondition(v) }
                    SwitchRow { label: qsTr("Skip"); checked: root.shared("skip") === 1; mixed: root.shared("skip") === null; onCommit: v => root.setSteps({skip: v}) }
                    Header { text: qsTr("General") }
                    StepNumber { objectName: "stepInspectorVelocity"; label: qsTr("Velocity"); mode: "velocity"; from: 1; to: 127 }
                    StepNumber { label: qsTr("Gate"); mode: "gate"; unit: "%"; from: 1; to: 100 }
                    SwitchRow { label: qsTr("Tie"); checked: root.shared("tie") === 1; mixed: root.shared("tie") === null; onCommit: v => root.setSteps({tie: v}) }
                    StepNumber { label: qsTr("Offset"); mode: "offset"; unit: "%"; from: -50; to: 50 }
                    NumberRow { label: qsTr("MIDI Channel"); from: 1; to: 16; value: root.stepField("midiChannel") || root.settings.midiChannel || 1; onCommit: v => root.setSteps({midiChannel: v}) }
                    StepNumber { objectName: "stepInspectorArticulation"; label: qsTr("Articulation"); mode: "articulation"; from: 0; to: 255 }
                    Header { text: qsTr("Repeats") }
                    StepNumber { label: qsTr("Repeat"); mode: "repeat"; from: 1; to: 16 }
                    StepNumber { objectName: "stepInspectorVelocityRamp"; label: qsTr("Velocity Ramp"); mode: "velocityRamp"; unit: "%"; from: -100; to: 100 }
                    StepNumber { objectName: "stepInspectorVelocityCurve"; label: qsTr("Velocity Curve"); mode: "velocityCurve"; unit: "%"; from: -100; to: 100 }
                    StepNumber { objectName: "stepInspectorDistribution"; label: qsTr("Distribution"); mode: "distribution"; unit: "%"; from: -100; to: 100 }
                }
            }
        }
    }

    component Header: Item {
        property alias text: headerText.text
        width: parent ? parent.width : 0
        height: headerText.height + Ui.Metrics.sm
        Ui.Text {
            id: headerText
            anchors.bottom: parent.bottom
            width: parent.width
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            font.capitalization: Font.AllUppercase
        }
    }
    component Caption: Ui.Text {
        width: root.labelWidth
        anchors.verticalCenter: parent ? parent.verticalCenter : undefined
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Secondary
        elide: Text.ElideRight
    }
    component SelectField: Row {
        id: sf
        property string label: ""
        property var options: []
        property var value
        signal commit(var value)
        width: parent ? parent.width : 0
        height: Ui.Metrics.compact
        Caption { text: sf.label }
        Ui.Select {
            width: sf.width - root.labelWidth
            density: Ui.EditorButton.Compact
            accessibleName: sf.label
            enabled: root.editable
            options: sf.options
            value: sf.value
            onValueCommitted: next => sf.commit(next)
        }
    }
    component NumberRow: Row {
        id: nr
        property string label: ""
        property string unit: ""
        property real value: 0
        property real from: 0
        property real to: 127
        property bool mixed: false
        signal commit(real value)
        width: parent ? parent.width : 0
        height: Ui.Metrics.compact
        Caption { text: nr.label }
        Ui.NumberField {
            width: Math.min(Ui.Metrics.xxxl * 2.4, nr.width - root.labelWidth)
            density: Ui.EditorButton.Compact
            accessibleName: nr.label
            enabled: root.editable
            value: nr.value
            displayValue: nr.mixed ? "*" : String(nr.value)
            unit: nr.unit
            from: nr.mixed ? -1000 : nr.from
            to: nr.mixed ? 1000 : nr.to
            onValueCommitted: next => nr.commit(Math.round(next))
        }
    }
    // A step value: `*` across differing steps, where the typed number is a relative change.
    component StepNumber: NumberRow {
        id: sn
        property string mode: "velocity"
        readonly property var common: root.shared(mode)
        mixed: common === null
        value: common === null ? 0 : common
        onCommit: v => root.commitStep(sn.mode, v)
    }
    component SwitchRow: Row {
        id: sw
        property string label: ""
        property bool checked: false
        property bool mixed: false
        signal commit(bool value)
        width: parent ? parent.width : 0
        height: Ui.Metrics.compact
        Caption { text: sw.label + (sw.mixed ? " *" : "") }
        Item { width: sw.width - root.labelWidth - toggle.width; height: 1 }
        Ui.Toggle {
            id: toggle
            anchors.verticalCenter: parent.verticalCenter
            accessibleName: sw.label
            enabled: root.editable
            checked: sw.checked
            onCheckedChangedByUser: next => sw.commit(next)
        }
    }
}
