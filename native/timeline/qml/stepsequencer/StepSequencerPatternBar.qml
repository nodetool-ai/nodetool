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
    readonly property var drums: [
        {pitch: 36, label: qsTr("Kick")}, {pitch: 38, label: qsTr("Snare")}, {pitch: 39, label: qsTr("Clap")},
        {pitch: 42, label: qsTr("Closed Hi-Hat")}, {pitch: 46, label: qsTr("Open Hi-Hat")}, {pitch: 49, label: qsTr("Crash")},
        {pitch: 51, label: qsTr("Ride")}, {pitch: 45, label: qsTr("Low Tom")}, {pitch: 48, label: qsTr("High Tom")},
        {pitch: 37, label: qsTr("Side Stick")}, {pitch: 56, label: qsTr("Cowbell")}, {pitch: 70, label: qsTr("Maracas")}
    ]
    readonly property var addEntries: [
        {id: "notes", label: qsTr("Notes"), submenu: [
            {id: "drums", label: qsTr("Drums"), submenu: drums.map(d => ({id: "addRow:note:" + d.pitch, label: d.label}))},
            {id: "addRow:melodic:60", label: qsTr("Melodic Row (C3)")},
            {id: "addRow:melodic:48", label: qsTr("Melodic Row (C2)")}
        ]},
        {id: "automation", label: qsTr("Automation"), submenu: [
            {id: "addRow:cc:1", label: qsTr("Modulation (CC 1)")},
            {id: "addRow:cc:7", label: qsTr("Volume (CC 7)")},
            {id: "addRow:cc:10", label: qsTr("Pan (CC 10)")},
            {id: "addRow:cc:11", label: qsTr("Expression (CC 11)")},
            {id: "addRow:cc:74", label: qsTr("Brightness (CC 74)")},
            {id: "addRow:pitchBend", label: qsTr("Pitch Bend")},
            {id: "addRow:channelPressure", label: qsTr("Channel Pressure")}
        ]}
    ]
    readonly property var lengthOptions: [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64].map(n => ({label: qsTr("%1 Steps").arg(n), value: n}))

    Row {
        height: parent.height
        spacing: Ui.Metrics.xs
        leftPadding: Ui.Metrics.md
        Ui.MenuButton {
            objectName: "stepSequencerAddRow"
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
        visible: root.panel.sequencer.valid
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
                readonly property int rowCount: Math.min(8, root.panel.rows.length)
                Repeater {
                    model: page.rowCount
                    delegate: Item {
                        id: line
                        required property int index
                        readonly property var row: root.panel.rows[index]
                        y: Ui.Metrics.micro + index * (page.height - Ui.Metrics.micro * 2) / page.rowCount
                        width: page.width
                        height: (page.height - Ui.Metrics.micro * 2) / page.rowCount
                        Repeater {
                            model: 16
                            delegate: Rectangle {
                                required property int index
                                readonly property int step: page.index * 16 + index
                                visible: !!line.row && step < line.row.lengthSteps && !!line.row.steps[step].on
                                x: Ui.Metrics.micro + index * (page.width - Ui.Metrics.micro * 2) / 16
                                width: Math.max(Ui.Metrics.border, (page.width - Ui.Metrics.micro * 2) / 16 - Ui.Metrics.border)
                                height: Math.max(Ui.Metrics.border, line.height - Ui.Metrics.border)
                                color: Modes.rowColor(line.row || {}, line.index)
                            }
                        }
                    }
                }
                MouseArea { anchors.fill: parent; onClicked: root.panel.showPage(page.index) }
            }
        }
    }
    Ui.Select {
        objectName: "stepSequencerLength"
        anchors.right: parent.right
        anchors.rightMargin: Ui.Metrics.md
        anchors.verticalCenter: parent.verticalCenter
        width: Ui.Metrics.xxxl * 2.8
        density: Ui.EditorButton.Compact
        accessibleName: qsTr("Pattern Length")
        enabled: root.editable
        options: root.lengthOptions
        value: root.settings.lengthSteps || 16
        onValueCommitted: next => root.panel.op("set_pattern", {lengthSteps: next})
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
