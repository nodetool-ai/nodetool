// The Step Sequencer pattern bar (SQ28 second bar, figure p0724): Add Row, the
// pattern step rate and playback mode, rotate, decrement/increment, randomize
// and clear for the whole pattern, the pattern name, one overview per page of
// 16 steps, and the Length select. Stateless. UI thread only.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.UiPrimitives as Ui
import "StepSequencerModes.js" as Modes

Rectangle {
    id: root
    required property var panel
    color: Ui.Theme.surfaceCanvas
    readonly property bool editable: panel.editable
    readonly property var settings: panel.settings
    readonly property string mode: panel.editMode
    // Add Row: one submenu per assignment group (web stepRowAssignments.ts).
    // Learn (SQ38) first: the next played note or controller adds or assigns a row.
    readonly property var addEntries: [
        {id: "learnAdd", label: qsTr("Learn (Add)")},
        {id: "learnAssign", label: qsTr("Learn (Assign)"), enabled: panel.selectedRowId !== ""},
        {separator: true}
    ].concat(panel.sequencer.addRowGroups.map(g => ({
        id: "group-" + g.id, label: g.label,
        submenu: g.choices.map((c, i) => ({id: "addRow:" + g.id + ":" + i, label: c.label}))
    })))
    // Length sections: 1 and 2 steps, then multiples of 4, 3, 5 and 7 up to 64 (SQ7, p. 731).
    readonly property var lengthEntries: {
        const out = [{header: qsTr("Short")}]
        for (const n of [1, 2]) out.push({id: "length:" + n, label: n === 1 ? qsTr("1 Step") : qsTr("%1 Steps").arg(n), checked: n === (settings.lengthSteps || 16)})
        for (const base of [4, 3, 5, 7]) {
            out.push({header: qsTr("%1 Based").arg(base)})
            for (let n = base; n <= 64; n += base) out.push({id: "length:" + n, label: qsTr("%1 Steps").arg(n), checked: n === (settings.lengthSteps || 16)})
        }
        return out
    }

    Row {
        height: parent.height
        spacing: Ui.Metrics.xs
        leftPadding: Ui.Metrics.md
        // Learn replaces Add Row while it listens; a click stops it.
        Ui.EditorButton {
            objectName: "stepSequencerLearn"
            visible: root.panel.sequencer.learnMode !== ""
            anchors.verticalCenter: parent.verticalCenter
            density: Ui.EditorButton.Compact
            // Quiet while it listens: a neutral button with a red record dot.
            variant: Ui.EditorButton.Default
            iconName: "statusDot"
            iconColor: Ui.Theme.statusError
            text: root.panel.sequencer.learnMode === "add" ? qsTr("Learn (Add)") : qsTr("Learn (Assign)")
            description: qsTr("Play a note or move a controller. Click to stop.")
            onClicked: root.panel.runAction("learnOff")
        }
        Ui.MenuButton {
            objectName: "stepSequencerAddRow"
            visible: root.panel.sequencer.learnMode === ""
            anchors.verticalCenter: parent.verticalCenter
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            iconName: "add"
            accessibleName: qsTr("Add Row")
            enabled: root.editable
            menu: addMenu
            Ui.ContextMenu { id: addMenu; entries: root.addEntries; onEntryTriggered: id => root.panel.runAction(id) }
        }
        Ui.Select {
            objectName: "stepSequencerRate"
            anchors.verticalCenter: parent.verticalCenter
            width: Ui.Metrics.xxxl * 1.7
            density: Ui.EditorButton.Compact
            accessibleName: qsTr("Pattern Step Rate")
            enabled: root.editable
            options: Modes.STEP_RATES.map(r => ({label: "/" + r.replace("1/", ""), value: r}))
            value: root.settings.stepRate || "1/16"
            onValueCommitted: next => root.panel.op("set_pattern", {stepRate: next})
        }
        Ui.Select {
            objectName: "stepSequencerPlayback"
            anchors.verticalCenter: parent.verticalCenter
            width: Ui.Metrics.xxxl * 1.4
            density: Ui.EditorButton.Compact
            accessibleName: qsTr("Pattern Playback Mode")
            enabled: root.editable
            options: Modes.PLAYBACK.map(p => ({label: p.glyph, value: p.value}))
            value: root.settings.playback || "forward"
            onValueCommitted: next => root.panel.op("set_pattern", {playback: next})
        }
        Tool { glyph: "rotateCounterclockwise"; tip: qsTr("Rotate Pattern Left"); onClicked: root.panel.runAction("rotatePatternLeft") }
        Tool { glyph: "rotateClockwise"; tip: qsTr("Rotate Pattern Right"); onClicked: root.panel.runAction("rotatePatternRight") }
        Tool { glyph: "remove"; tip: qsTr("Decrement Pattern Values"); onClicked: root.panel.runAction("decrementPattern") }
        Tool { glyph: "add"; tip: qsTr("Increment Pattern Values"); onClicked: root.panel.runAction("incrementPattern") }
        Tool { glyph: "autoFixHigh"; tip: qsTr("Randomize Pattern"); onClicked: root.panel.runAction("randomizeAll") }
        Tool { glyph: "closeOutlined"; tip: qsTr("Clear Pattern"); onClicked: root.panel.runAction("clearPatternMode") }
        Item { width: Ui.Metrics.md; height: 1 }
        Ui.NumberField {
            objectName: "stepSequencerRecordCursor"
            visible: root.panel.sequencer.stepRecording
            anchors.verticalCenter: parent.verticalCenter
            width: Ui.Metrics.xxxl * 2
            density: Ui.EditorButton.Compact
            accessibleName: qsTr("Step Input Position")
            unit: qsTr("Step")
            from: 1
            to: root.settings.lengthSteps || 16
            value: root.panel.sequencer.recordStep + 1
            onValueCommitted: next => root.panel.sequencer.recordStep = Math.round(next) - 1
        }
        Ui.Text {
            objectName: "stepSequencerPatternName"
            anchors.verticalCenter: parent.verticalCenter
            width: Ui.Metrics.xxxl * 4
            text: root.settings.name || root.panel.sequencer.clipName
            role: Ui.Typography.SansBody
            weight: Font.DemiBold
            elide: Text.ElideRight
            tight: true
        }
    }
    // Page overviews: one thumbnail per 16 steps. A click shows that page (SQ28).
    Row {
        objectName: "stepSequencerPages"
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.horizontalCenterOffset: Ui.Metrics.xxxl * 2
        anchors.verticalCenter: parent.verticalCenter
        spacing: Ui.Metrics.xs
        visible: root.panel.sequencer.valid && !root.panel.sequencer.stepRecording
        Repeater {
            model: Math.ceil(root.panel.maxLength / 16)
            delegate: Rectangle {
                id: page
                required property int index
                objectName: "stepSequencerPage-" + index
                width: Ui.Metrics.xxxl * 2.4
                height: Ui.Metrics.small
                radius: Ui.Metrics.micro
                color: Ui.Theme.surfacePanel
                border.width: Ui.Metrics.border
                border.color: root.panel.page === index ? Ui.Theme.textSecondary : Ui.Theme.borderSubtle
                // One Canvas per page draws the first 8 rows, not one item per step.
                Canvas {
                    id: overview
                    anchors.fill: parent
                    readonly property var rows: root.panel.rows
                    onRowsChanged: requestPaint()
                    onPaint: {
                        const ctx = getContext("2d")
                        ctx.reset()
                        const list = rows.slice(0, 8)
                        if (!list.length) return
                        const inset = Ui.Metrics.micro
                        const lineH = (height - inset * 2) / list.length
                        const cellW = (width - inset * 2) / 16
                        for (let r = 0; r < list.length; ++r) {
                            const row = list[r]
                            ctx.fillStyle = Modes.rowColor(row, r)
                            for (let i = 0; i < 16; ++i) {
                                const step = page.index * 16 + i
                                if (step >= row.lengthSteps || !(row.steps[step] && row.steps[step].on)) continue
                                ctx.fillRect(inset + i * cellW, inset + r * lineH, Math.max(Ui.Metrics.border, cellW - Ui.Metrics.border),
                                             Math.max(Ui.Metrics.border, lineH - Ui.Metrics.border))
                            }
                        }
                    }
                }
                MouseArea { anchors.fill: parent; onClicked: root.panel.showPage(page.index) }
            }
        }
    }
    Ui.MenuButton {
        objectName: "stepSequencerLength"
        anchors.right: parent.right
        anchors.rightMargin: Ui.Metrics.md
        anchors.verticalCenter: parent.verticalCenter
        density: Ui.EditorButton.Compact
        text: (root.settings.lengthSteps || 16) === 1 ? qsTr("1 Step") : qsTr("%1 Steps").arg(root.settings.lengthSteps || 16)
        accessibleName: qsTr("Pattern Length")
        enabled: root.editable
        menu: lengthMenu
        Ui.ContextMenu { id: lengthMenu; entries: root.lengthEntries; onEntryTriggered: id => root.panel.runAction(id) }
    }
    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: Ui.Metrics.border; color: Ui.Theme.borderSubtle }

    component Tool: Ui.ToolbarIconButton {
        property string glyph: ""
        property string tip: ""
        anchors.verticalCenter: parent.verticalCenter
        iconName: glyph
        accessibleName: tip
        description: tip
        enabled: root.editable
    }
}
