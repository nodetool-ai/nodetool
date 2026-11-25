// One pattern row of the Step Sequencer (figure p0724): the row header and the
// step cells in the current edit mode, then one subrow per `row.subrows` mode
// when the row is open (figure p0736). The row model (StepSequencerRowModel)
// gives the row map and the playing step, so an edit or the playhead updates
// only the rows it touches. Cells exist only for the steps in view
// (PERFORMANCE.md rules 3 and 6). The panel owns selection, previews and every
// write. UI thread only.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.UiPrimitives as Ui
import "StepSequencerModes.js" as Modes

Item {
    id: root
    required property var panel
    required property var rowData
    required property int playingStep
    required property int index
    readonly property var row: rowData
    readonly property color rowColor: Modes.rowColor(row, index)
    readonly property bool selected: panel.selectedRowId === row.id
    // Expansion is document data (SQ8): `row.subrowsExpanded`.
    readonly property bool expanded: row.subrowsExpanded === true
    readonly property var subrows: expanded ? (row.subrows || []) : []
    readonly property real laneHeight: panel.rowHeight
    readonly property real subHeight: Math.round(panel.rowHeight * 0.7)
    readonly property bool dropTarget: panel.rowDrag !== null && panel.rowDrag.target === index && panel.rowDrag.id !== row.id
    width: ListView.view ? ListView.view.width : 0
    height: laneHeight + subrows.length * subHeight
    objectName: "stepRow-" + row.id

    Lane {
        y: 0
        height: root.laneHeight
        mode: Modes.effectiveMode(root.row, root.panel.editMode)
        main: true
    }
    Repeater {
        model: root.subrows
        delegate: Lane {
            required property string modelData
            required property int index
            y: root.laneHeight + index * root.subHeight
            height: root.subHeight
            mode: Modes.effectiveMode(root.row, modelData)
            main: false
            subIndex: index
        }
    }
    // The drop line of a row header drag.
    Rectangle {
        visible: root.dropTarget
        width: root.panel.headerWidth
        height: Ui.Metrics.focus
        color: Ui.Theme.borderFocus
    }

    component Lane: Item {
        id: lane
        property string mode: "onOff"
        property bool main: true
        property int subIndex: -1
        width: root.width
        readonly property var spec: Modes.spec(mode)
        // Number modes draw the value as a bar from the cell floor (figure p0736).
        readonly property bool barMode: (spec.kind === "number" || spec.kind === "rate") && mode !== "repeat"
        readonly property bool showValues: spec.kind !== "bool" && spec.kind !== "loop" &&
            (root.panel.displayValues === "all" || (root.panel.displayValues === "selected" && root.selected) || !main)
        objectName: main ? "stepLane-" + root.row.id : "stepSubLane-" + root.row.id + "-" + mode

        // ── Header ─────────────────────────────────────────────────────────
        Rectangle {
            id: header
            width: root.panel.headerWidth
            height: parent.height
            color: root.selected && lane.main ? Ui.Theme.actionSelected : Ui.Theme.surfacePanel
            Rectangle {
                width: Ui.Metrics.micro + Ui.Metrics.border
                height: parent.height
                color: root.rowColor
                visible: root.panel.rowColors
            }
            Rectangle {
                anchors.bottom: parent.bottom
                width: parent.width
                height: Ui.Metrics.border
                color: Ui.Theme.borderSubtle
            }
            MouseArea {
                id: headerArea
                objectName: lane.main ? "stepRowHeader-" + root.row.id : ""
                anchors.fill: parent
                hoverEnabled: lane.main
                acceptedButtons: Qt.LeftButton | Qt.RightButton
                property real pressY: 0
                onPressed: mouse => {
                    pressY = mouse.y
                    root.panel.forceActiveFocus()
                    root.panel.selectRow(root.row.id)
                    if (mouse.button === Qt.RightButton) root.panel.openRowMenu(root.row.id, header, mouse.x, mouse.y)
                }
                // Drag a row header to reorder rows (SQ29).
                onPositionChanged: mouse => {
                    if (!pressed || !lane.main || !(mouse.buttons & Qt.LeftButton)) return
                    if (root.panel.rowDrag === null && Math.abs(mouse.y - pressY) < Ui.Metrics.sm) return
                    root.panel.dragRow(root.row.id, root.index, header.mapToItem(root.ListView.view.contentItem, mouse.x, mouse.y).y)
                }
                onReleased: root.panel.dropRow()
                onCanceled: root.panel.cancelRowDrag()
                onDoubleClicked: root.panel.renameRow(root.row.id)
            }
            // Top line: disclosure, icon, name, mode label.
            Row {
                visible: lane.main
                x: Ui.Metrics.sm
                y: Ui.Metrics.xs
                height: Ui.Metrics.small
                spacing: Ui.Metrics.xs
                Ui.EditorButton {
                    id: disclosure
                    objectName: "stepRowDisclosure-" + root.row.id
                    anchors.verticalCenter: parent.verticalCenter
                    width: Ui.Metrics.iconMd
                    height: Ui.Metrics.iconMd
                    density: Ui.EditorButton.Compact
                    variant: Ui.EditorButton.Flat
                    iconName: root.expanded ? "expandMore" : "arrowRight"
                    iconSize: Ui.Metrics.iconXs
                    accessibleName: root.expanded ? qsTr("Hide Subrows") : qsTr("Show Subrows")
                    // Option-click toggles every row (SQ35).
                    onClicked: root.panel.setSubrowsShown(root.row.id, !root.expanded, (root.panel.keyModifiers & Qt.AltModifier) !== 0)
                }
                Ui.Icon {
                    anchors.verticalCenter: parent.verticalCenter
                    name: Modes.rowIcon(root.row)
                    size: Ui.Metrics.iconSm
                    domainColor: root.rowColor
                }
                Ui.Text {
                    objectName: "stepRowName-" + root.row.id
                    anchors.verticalCenter: parent.verticalCenter
                    width: root.panel.headerWidth - Ui.Metrics.xxxl * 2.6
                    text: root.row.label
                    role: Ui.Typography.SansLabel
                    tone: root.row.mute ? Ui.Text.Disabled : Ui.Text.Primary
                    elide: Text.ElideRight
                    tight: true
                }
            }
            Ui.Text {
                visible: lane.main && !headerArea.containsMouse
                anchors.right: parent.right
                anchors.rightMargin: Ui.Metrics.md
                y: Ui.Metrics.xs + (Ui.Metrics.small - height) / 2
                text: Modes.modeLabel(lane.mode)
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                tight: true
            }
            // Hover: add and delete subrow (SQ29, figure p0736).
            Row {
                visible: lane.main && headerArea.containsMouse && root.panel.editable
                anchors.right: parent.right
                anchors.rightMargin: Ui.Metrics.sm
                y: Ui.Metrics.xs + (Ui.Metrics.small - height) / 2
                spacing: Ui.Metrics.micro
                Tool { objectName: "stepRowAddSubrow-" + root.row.id; glyph: "add"; tip: qsTr("Add Subrow"); onClicked: root.panel.addSubrow(root.row.id) }
                Tool { objectName: "stepRowDeleteSubrow-" + root.row.id; glyph: "remove"; tip: qsTr("Delete Subrow"); enabled: root.panel.editable && (root.row.subrows || []).length > 0; onClicked: root.panel.deleteSubrow(root.row.id) }
            }
            // Bottom line: M S, playback, rotate, decrement/increment, randomize, clear.
            Row {
                visible: lane.main && root.laneHeight >= Ui.Metrics.xxxl * 1.4
                x: Ui.Metrics.lg
                anchors.bottom: parent.bottom
                anchors.bottomMargin: Ui.Metrics.xs
                height: Ui.Metrics.small
                spacing: Ui.Metrics.micro
                Toggle {
                    objectName: "stepRowMute-" + root.row.id
                    text: "M"
                    accessibleName: qsTr("Mute Row")
                    checked: !!root.row.mute
                    onClicked: root.panel.op("set_pattern_row", {row: root.row.id, mute: !root.row.mute})
                }
                Toggle {
                    objectName: "stepRowSolo-" + root.row.id
                    text: "S"
                    accessibleName: qsTr("Solo Row")
                    checked: !!root.row.solo
                    onClicked: root.panel.op("set_pattern_row", {row: root.row.id, solo: !root.row.solo})
                }
                RowTools { rowId: root.row.id; mode: lane.mode }
            }
            // A subrow header: its mode select and the same tools for that mode only.
            Row {
                visible: !lane.main
                x: Ui.Metrics.lg
                anchors.verticalCenter: parent.verticalCenter
                spacing: Ui.Metrics.micro
                Ui.Select {
                    objectName: "stepSubrowMode-" + root.row.id + "-" + lane.subIndex
                    // Fits "Velocity" and "Chance" with the chevron.
                    width: Ui.Metrics.xxxl * 3.2
                    density: Ui.EditorButton.Compact
                    accessibleName: qsTr("Subrow Mode")
                    options: Modes.MODES.filter(m => m.value !== "onOff" && Modes.supportsMode(root.row, Modes.effectiveMode(root.row, m.value)))
                                        .map(m => ({label: m.value === "velocity" ? qsTr("Velocity") : m.label, value: m.value}))
                    value: lane.mode === "value" ? "velocity" : lane.mode
                    onValueCommitted: next => root.panel.setSubrowMode(root.row.id, lane.subIndex, next)
                }
                RowTools { rowId: root.row.id; mode: lane.mode; compact: true }
            }
        }

        // ── Steps ──────────────────────────────────────────────────────────
        Item {
            id: cells
            objectName: lane.main ? "stepCells-" + root.row.id : "stepSubCells-" + root.row.id + "-" + lane.mode
            x: root.panel.headerWidth
            width: parent.width - x
            height: parent.height
            readonly property real cellWidth: root.panel.cellWidth
            readonly property real gap: Ui.Metrics.micro
            readonly property int first: Math.min(root.panel.firstStep, root.row.lengthSteps)
            Repeater {
                model: Math.max(0, Math.min(root.row.lengthSteps - cells.first, root.panel.stepWindow))
                delegate: Rectangle {
                    id: cell
                    required property int index
                    readonly property int step: cells.first + index
                    readonly property var stepData: root.row.steps[step] || ({})
                    readonly property var preview: root.panel.previewFor(root.row.id, step)
                    readonly property bool on: preview && preview.on !== undefined ? preview.on : !!stepData.on
                    readonly property bool continues: Modes.continuesTie(root.row, step)
                    readonly property bool inLoop: step >= root.row.loopStart && step < root.row.loopEnd
                    readonly property bool selectedStep: root.panel.isStepSelected(root.row.id, step)
                    readonly property bool playing: root.playingStep === step
                    // A tie joins across the beat gap too (SQ30).
                    readonly property real join: continues ? cells.gap + Ui.Metrics.border + (step % 4 === 0 ? Ui.Metrics.xs : 0) : 0
                    x: root.panel.stepX(step) - root.panel.scrollX - join
                    y: Ui.Metrics.micro
                    width: cells.cellWidth - cells.gap + join
                    height: lane.height - Ui.Metrics.micro * 2
                    visible: x + width > 0 && x < cells.width
                    radius: Ui.Metrics.micro
                    color: lane.mode === "loop"
                        ? (inLoop ? Qt.alpha(root.rowColor, 0.55) : Qt.alpha(root.rowColor, 0.12))
                        : lane.barMode ? Qt.alpha(root.rowColor, on ? 0.2 : 0.08)
                        : on ? (root.row.mute ? Qt.alpha(root.rowColor, 0.45) : root.rowColor)
                             : Qt.alpha(root.rowColor, lane.main ? 0.16 : 0.1)
                    border.width: playing || selectedStep ? Ui.Metrics.focus : Ui.Metrics.border
                    border.color: playing ? Ui.Theme.textPrimary : selectedStep ? Ui.Theme.borderFocus : Qt.alpha(root.rowColor, on ? 0.9 : 0.28)
                    // Value modes: a bar filled up to the value height (p. 736).
                    Rectangle {
                        id: valueBar
                        visible: lane.barMode
                        readonly property var r: Modes.range(root.row, lane.mode)
                        readonly property real f: cell.preview && cell.preview.value !== undefined
                            ? (cell.preview.value - r.min) / Math.max(1e-9, r.max - r.min)
                            : Modes.fraction(root.row, cell.step, lane.mode)
                        readonly property real clamped: Math.max(0, Math.min(1, f))
                        x: Ui.Metrics.border
                        width: parent.width - Ui.Metrics.border * 2
                        height: Math.max(Ui.Metrics.micro, (parent.height - Ui.Metrics.border * 2) * clamped)
                        y: parent.height - Ui.Metrics.border - height
                        radius: Ui.Metrics.micro
                        color: !cell.on ? Qt.alpha(root.rowColor, 0.3) : root.row.mute ? Qt.alpha(root.rowColor, 0.45) : root.rowColor
                    }
                    // Repeat: one thin bar per repeat, up to 16.
                    Row {
                        anchors.centerIn: parent
                        spacing: Ui.Metrics.border
                        Repeater {
                            model: lane.mode === "repeat" && cell.on ? Math.min(16, cell.stepData.repeat || 1) : 0
                            delegate: Rectangle { width: Ui.Metrics.border * 2; height: cell.height * 0.4; color: Ui.Theme.surfaceCanvas; opacity: 0.6 }
                        }
                    }
                    // Chance: a dot texture, one dot per 12.5 % (SQ30).
                    Grid {
                        anchors.centerIn: parent
                        columns: 4
                        spacing: Ui.Metrics.micro
                        Repeater {
                            model: lane.mode === "chance" && cell.on && !lane.barMode ? Math.round((cell.stepData.chance !== undefined ? cell.stepData.chance : 100) / 12.5) : 0
                            delegate: Rectangle { width: Ui.Metrics.micro; height: Ui.Metrics.micro; radius: Ui.Metrics.micro; color: Ui.Theme.surfaceCanvas; opacity: 0.8 }
                        }
                    }
                    Ui.Text {
                        // A number shows only when it fits the cell; the bar carries the value otherwise.
                        readonly property bool wanted: lane.showValues || (cell.preview && cell.preview.value !== undefined)
                        visible: wanted && implicitWidth <= width
                        x: Ui.Metrics.xs
                        anchors.bottom: parent.bottom
                        anchors.bottomMargin: Ui.Metrics.micro
                        width: parent.width - Ui.Metrics.xs
                        text: !wanted ? "" : cell.preview && cell.preview.value !== undefined
                            ? Modes.textFor(root.row, lane.mode, cell.preview.value, cell.stepData)
                            : Modes.text(root.row, cell.step, lane.mode)
                        role: Ui.Typography.MonoCaption
                        domainColor: !cell.on ? Ui.Theme.textSecondary
                            : !lane.barMode || valueBar.clamped > 0.4 ? Ui.Theme.surfaceCanvas : Ui.Theme.textPrimary
                        tight: true
                    }
                    // A tie join: a diamond on the left edge (SQ30).
                    Rectangle {
                        visible: cell.continues
                        width: Ui.Metrics.sm
                        height: Ui.Metrics.sm
                        rotation: 45
                        x: cell.join - width / 2
                        anchors.verticalCenter: parent.verticalCenter
                        color: Ui.Theme.surfaceCanvas
                    }
                    Rectangle {
                        visible: lane.mode === "skip" && !!cell.stepData.skip
                        anchors.centerIn: parent
                        width: parent.width * 0.6
                        height: Ui.Metrics.micro
                        rotation: -35
                        color: Ui.Theme.textPrimary
                    }
                }
            }
            Rectangle {
                anchors.bottom: parent.bottom
                width: parent.width
                height: Ui.Metrics.border
                color: Ui.Theme.borderSubtle
            }
            MouseArea {
                id: gesture
                objectName: lane.main ? "stepGesture-" + root.row.id : "stepSubGesture-" + root.row.id + "-" + lane.mode
                anchors.fill: parent
                hoverEnabled: true
                acceptedButtons: Qt.LeftButton | Qt.RightButton
                preventStealing: true
                cursorShape: (gesture.modifiers & Qt.AltModifier) && !(gesture.modifiers & Qt.ControlModifier) ? Qt.CrossCursor : Qt.PointingHandCursor
                property int modifiers: Qt.NoModifier
                // -1 past the row's own length (a polymetric row, SQ7).
                function stepAt(x) { return root.panel.stepAt(x, root.row.lengthSteps) }
                function fractionAt(y) { return 1 - y / height }
                onPressed: mouse => {
                    modifiers = mouse.modifiers
                    root.panel.forceActiveFocus()
                    const s = stepAt(mouse.x)
                    if (s < 0) return
                    if (mouse.button === Qt.RightButton) {
                        root.panel.openStepMenu(root.row.id, s, gesture, mouse.x, mouse.y)
                        return
                    }
                    root.panel.beginGesture(root.row, s, lane.mode, fractionAt(mouse.y), mouse.modifiers)
                }
                onPositionChanged: mouse => {
                    if (pressed) root.panel.moveGesture(Math.max(0, Math.min(root.row.lengthSteps - 1, root.panel.stepAt(mouse.x, 0))), fractionAt(mouse.y))
                }
                onReleased: mouse => { if (mouse.button === Qt.LeftButton) root.panel.endGesture() }
                onCanceled: root.panel.cancelGesture()
            }
        }
    }

    component Toggle: Ui.EditorButton {
        anchors.verticalCenter: parent ? parent.verticalCenter : undefined
        width: Ui.Metrics.compact
        height: Ui.Metrics.small
        density: Ui.EditorButton.Compact
        variant: Ui.EditorButton.Outlined
        flat: !checked
        textRole: Ui.Typography.SansCaption
        checkable: false
        highlighted: checked
    }

    component RowTools: Row {
        id: tools
        property string rowId: ""
        property string mode: "onOff"
        property bool compact: false
        spacing: Ui.Metrics.micro
        anchors.verticalCenter: parent ? parent.verticalCenter : undefined
        Ui.Select {
            visible: !tools.compact
            width: Ui.Metrics.xxxl * 1.5
            density: Ui.EditorButton.Compact
            accessibleName: qsTr("Row Playback Mode")
            options: Modes.PLAYBACK.map(p => ({label: p.glyph, value: p.value}))
            value: root.row.playback
            onValueCommitted: next => root.panel.op("set_pattern_row", {row: tools.rowId, playback: next})
        }
        Tool { glyph: "rotateCounterclockwise"; tip: qsTr("Rotate Row Left"); onClicked: root.panel.op("rotate_pattern", tools.argsWith({by: -1})) }
        Tool { glyph: "rotateClockwise"; tip: qsTr("Rotate Row Right"); onClicked: root.panel.op("rotate_pattern", tools.argsWith({by: 1})) }
        Tool { glyph: "remove"; tip: qsTr("Decrement Row Values"); onClicked: root.panel.nudge(tools.rowId, tools.mode, -1) }
        Tool { glyph: "add"; tip: qsTr("Increment Row Values"); onClicked: root.panel.nudge(tools.rowId, tools.mode, 1) }
        Tool { glyph: "autoFixHigh"; tip: qsTr("Randomize Row"); onClicked: root.panel.randomize([tools.rowId], tools.mode) }
        Tool { glyph: "closeOutlined"; tip: qsTr("Clear Row"); onClicked: root.panel.clearRow(tools.rowId, tools.compact ? tools.mode : "") }
        function argsWith(extra) {
            const out = {row: tools.rowId}
            // A subrow rotate moves only that mode's values and keeps on/off (p. 748).
            if (tools.compact && tools.mode !== "onOff") out.mode = tools.mode
            for (const k in extra) out[k] = extra[k]
            return out
        }
    }

    component Tool: Ui.EditorButton {
        property string glyph: ""
        property string tip: ""
        anchors.verticalCenter: parent ? parent.verticalCenter : undefined
        width: Ui.Metrics.iconLg
        height: Ui.Metrics.iconLg
        density: Ui.EditorButton.Compact
        variant: Ui.EditorButton.Flat
        iconName: glyph
        iconSize: Ui.Metrics.iconXs
        accessibleName: tip
        description: tip
        enabled: root.panel.editable
    }
}
