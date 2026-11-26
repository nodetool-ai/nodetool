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
            Loader {
                property bool loadedOnce: false
                readonly property bool showing: lane.main && headerArea.containsMouse && root.panel.editable
                onShowingChanged: if (showing) loadedOnce = true
                active: showing || loadedOnce
                visible: showing
                anchors.right: parent.right
                anchors.rightMargin: Ui.Metrics.sm
                y: Ui.Metrics.xs + (Ui.Metrics.small - height) / 2
                sourceComponent: Row {
                    spacing: Ui.Metrics.micro
                    Tool { objectName: "stepRowAddSubrow-" + root.row.id; glyph: "add"; tip: qsTr("Add Subrow"); onClicked: root.panel.addSubrow(root.row.id) }
                    Tool { objectName: "stepRowDeleteSubrow-" + root.row.id; glyph: "remove"; tip: qsTr("Delete Subrow"); enabled: root.panel.editable && (root.row.subrows || []).length > 0; onClicked: root.panel.deleteSubrow(root.row.id) }
                }
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
            Loader {
                active: !lane.main
                x: Ui.Metrics.lg
                anchors.verticalCenter: parent.verticalCenter
                sourceComponent: Row {
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
            // One paint surface per lane keeps the view virtualized at row level.
            // Selection and previews are keyed once by the panel, not searched per cell.
            Canvas {
                id: paint
                anchors.fill: parent
                readonly property var rowData: root.row
                readonly property color rowColor: root.rowColor
                readonly property string mode: lane.mode
                readonly property bool showValues: lane.showValues
                // Stable row signatures prevent unrelated selection/preview updates
                // from invalidating this paint surface.
                readonly property string selectionSignature: JSON.stringify(root.panel.selectedSteps.filter(s => s.row === root.row.id).map(s => s.step))
                readonly property var selectedKeys: {
                    const keys = {}
                    for (const step of JSON.parse(selectionSignature)) keys[root.row.id + ":" + step] = true
                    return keys
                }
                readonly property string previewSignature: {
                    const own = {}
                    const prefix = root.row.id + ":"
                    const all = root.panel.previewMap
                    for (const key of Object.keys(all)) if (key.indexOf(prefix) === 0) own[key] = all[key]
                    return JSON.stringify(own)
                }
                readonly property var previews: JSON.parse(previewSignature)
                readonly property var ties: Modes.tieContinuations(rowData,previews,Math.min(rowData.lengthSteps,firstStep+stepWindow))
                readonly property bool barMode: lane.barMode
                readonly property bool mainLane: lane.main
                onBarModeChanged: requestPaint()
                onMainLaneChanged: requestPaint()
                onVisibleChanged: if (visible) requestPaint()
                onAvailableChanged: if (available) requestPaint()
                readonly property int firstStep: cells.first
                readonly property real cellWidth: cells.cellWidth
                readonly property real scrollX: root.panel.scrollX
                readonly property int stepWindow: root.panel.stepWindow
                readonly property string textFont: Ui.Typography.canvasFont(Ui.Typography.MonoCaption)
                onTextFontChanged: requestPaint()
                onRowDataChanged: requestPaint()
                onRowColorChanged: requestPaint()
                onModeChanged: requestPaint()
                onShowValuesChanged: requestPaint()
                onSelectedKeysChanged: requestPaint()
                onPreviewsChanged: requestPaint()
                onFirstStepChanged: requestPaint()
                onCellWidthChanged: requestPaint()
                onScrollXChanged: requestPaint()
                onStepWindowChanged: requestPaint()
                onWidthChanged: requestPaint()
                onHeightChanged: requestPaint()
                Connections {
                    target: Ui.Theme
                    function onTextPrimaryChanged() { paint.requestPaint() }
                    function onTextSecondaryChanged() { paint.requestPaint() }
                    function onSurfaceCanvasChanged() { paint.requestPaint() }
                    function onBorderFocusChanged() { paint.requestPaint() }
                }
                function box(ctx, x, y, w, h, radius, fill, border, stroke) {
                    ctx.beginPath()
                    ctx.roundedRect(x, y, Math.max(0, w), Math.max(0, h), radius, radius)
                    ctx.fillStyle = fill
                    ctx.fill()
                    if (border > 0) {
                        ctx.lineWidth = border
                        ctx.strokeStyle = stroke
                        ctx.stroke()
                    }
                }
                onPaint: {
                    const ctx = getContext("2d")
                    const row = rowData
                    if (!ctx || !row || !row.steps || width <= 0 || height <= 0) return
                    ctx.reset()
                    const steps = row.steps
                    const first = firstStep
                    const end = Math.min(row.lengthSteps, first + stepWindow)
                    const gap = cells.gap
                    const y = Ui.Metrics.micro
                    const h = height - y * 2
                    const color = rowColor
                    const bars = barMode
                    const range = Modes.range(row, mode)
                    const selected = selectedKeys
                    const preview = previews
                    ctx.font = textFont
                    ctx.textBaseline = "bottom"
                    // A single forward pass carries tie state, including a tie
                    // starting before the visible page. No backwards scan per cell.
                    const ties = paint.ties
                    for (let i = 0; i < end; ++i) {
                        const data = steps[i] || ({})
                        const continues = ties[i]
                        if (i < first) continue
                        const key = row.id + ":" + i
                        const p = preview[key]
                        const on = p && p.on !== undefined ? p.on : !!data.on
                        const inLoop = i >= row.loopStart && i < row.loopEnd
                        const join = continues ? gap + Ui.Metrics.border + (i % 4 === 0 ? Ui.Metrics.xs : 0) : 0
                        const x = root.panel.stepX(i) - scrollX - join
                        const w = cellWidth - gap + join
                        if (x + w <= 0 || x >= width) continue
                        const isSelected = selected[key] === true
                        const fill = mode === "loop" ? Qt.alpha(color, inLoop ? 0.55 : 0.12)
                            : bars ? Qt.alpha(color, on ? 0.2 : 0.08)
                            : on ? (row.mute ? Qt.alpha(color, 0.45) : color)
                            : Qt.alpha(color, mainLane ? 0.16 : 0.1)
                        const border = isSelected ? Ui.Metrics.focus : Ui.Metrics.border
                        // Rectangle borders lie inside their bounds.
                        box(ctx, x + border / 2, y + border / 2, w - border, h - border, Ui.Metrics.micro,
                            fill, border, isSelected ? Ui.Theme.borderFocus : Qt.alpha(color, on ? 0.9 : 0.28))
                        const f = p && p.value !== undefined ? (p.value - range.min) / Math.max(1e-9, range.max - range.min) : Modes.fraction(row, i, mode)
                        const clamped = Math.max(0, Math.min(1, f))
                        if (bars) {
                            const bh = Math.max(Ui.Metrics.micro, (h - Ui.Metrics.border * 2) * clamped)
                            box(ctx, x + Ui.Metrics.border, y + h - Ui.Metrics.border - bh, w - Ui.Metrics.border * 2, bh,
                                Ui.Metrics.micro, !on ? Qt.alpha(color, 0.3) : row.mute ? Qt.alpha(color, 0.45) : color, 0, color)
                        }
                        if (mode === "repeat" && on) {
                            const n = Math.min(16, data.repeat || 1)
                            const bw = Ui.Metrics.border * 2
                            const total = n * bw + (n - 1) * Ui.Metrics.border
                            ctx.fillStyle = Qt.alpha(Ui.Theme.surfaceCanvas, 0.6)
                            for (let r = 0; r < n; ++r) ctx.fillRect(x + (w - total) / 2 + r * (bw + Ui.Metrics.border), y + h * 0.3, bw, h * 0.4)
                        }
                        if (mode === "chance" && on && !bars) {
                            const n = Math.round((data.chance !== undefined ? data.chance : 100) / 12.5)
                            const size = Ui.Metrics.micro
                            const columns = Math.min(4, n)
                            const rows = Math.ceil(n / 4)
                            for (let r = 0; r < n; ++r) box(ctx, x + (w - (columns * 2 - 1) * size) / 2 + (r % 4) * size * 2,
                                y + (h - (rows * 2 - 1) * size) / 2 + Math.floor(r / 4) * size * 2, size, size, size, Qt.alpha(Ui.Theme.surfaceCanvas, 0.8), 0, color)
                        }
                        if (showValues || (p && p.value !== undefined)) {
                            const text = p && p.value !== undefined ? Modes.textFor(row, mode, p.value, data) : Modes.text(row, i, mode)
                            if (ctx.measureText(text).width <= w - Ui.Metrics.xs) {
                                ctx.fillStyle = !on ? Ui.Theme.textSecondary : !bars || clamped > 0.4 ? Ui.Theme.surfaceCanvas : Ui.Theme.textPrimary
                                ctx.fillText(text, x + Ui.Metrics.xs, y + h - Ui.Metrics.micro)
                            }
                        }
                        if (continues) {
                            ctx.save()
                            ctx.translate(x + join, y + h / 2)
                            ctx.rotate(Math.PI / 4)
                            ctx.fillStyle = Ui.Theme.surfaceCanvas
                            ctx.fillRect(-Ui.Metrics.sm / 2, -Ui.Metrics.sm / 2, Ui.Metrics.sm, Ui.Metrics.sm)
                            ctx.restore()
                        }
                        if (mode === "skip" && data.skip) {
                            ctx.save()
                            ctx.translate(x + w / 2, y + h / 2)
                            ctx.rotate(-35 * Math.PI / 180)
                            ctx.fillStyle = Ui.Theme.textPrimary
                            ctx.fillRect(-w * 0.3, -Ui.Metrics.micro / 2, w * 0.6, Ui.Metrics.micro)
                            ctx.restore()
                        }
                    }
                }
            }
            Rectangle {
                objectName: "stepPlayingOutline-" + root.row.id + "-" + lane.mode
                visible: root.playingStep >= 0 && root.playingStep < root.row.lengthSteps && x+width>0 && x<paint.width
                readonly property real join: paint.ties[root.playingStep] ? cells.gap+Ui.Metrics.border+(root.playingStep%4===0 ? Ui.Metrics.xs : 0) : 0
                x: root.playingStep>=0 ? root.panel.stepX(root.playingStep)-paint.scrollX-join : 0
                y: Ui.Metrics.micro
                width: paint.cellWidth-cells.gap+join
                height: paint.height-2*Ui.Metrics.micro
                radius: Ui.Metrics.micro
                color: "transparent"
                border.width: Ui.Metrics.focus
                border.color: Ui.Theme.textPrimary
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
