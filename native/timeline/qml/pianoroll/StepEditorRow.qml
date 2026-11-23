// One virtualized lane. The parent owns selection, settings and gesture previews.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.UiPrimitives as Ui
import "PianoRollTools.js" as Tools
import "PianoRollNotes.js" as Notes

Item {
    id: row
    required property var panel
    required property var lane
    property bool pooled: false
    ListView.onPooled: row.pooled = true
    ListView.onReused: { row.pooled = false; beams.requestPaint(); }
    readonly property bool selected: panel.keyOf(lane) === panel.selectedLaneKey
    // The lane header: a flat button with a left-aligned name. The selected lane carries the
    // accent bar at its left edge and the selected shade across header and steps.
    Ui.EditorButton {
        x: Ui.Metrics.micro
        width: row.panel.nameWidth - x
        height: parent.height
        text: row.panel.laneName(row.lane)
        accessibleName: qsTr("Select lane %1").arg(text)
        variant: Ui.EditorButton.Flat
        contentAlignment: Qt.AlignLeft
        textTone: row.selected ? Ui.Text.Primary : Ui.Text.Secondary
        checked: row.selected
        onClicked: {
            row.panel.forceActiveFocus();
            row.panel.selectLane(row.lane);
        }
    }
    Rectangle {
        width: Ui.Metrics.micro
        height: parent.height
        color: Ui.Theme.accentPrimary
        visible: row.selected
    }
    Rectangle {
        x: row.panel.nameWidth - Ui.Metrics.border
        width: Ui.Metrics.border
        height: parent.height
        color: Ui.Theme.borderSubtle
    }
    Rectangle {
        width: row.panel.nameWidth
        height: Ui.Metrics.border
        anchors.bottom: parent.bottom
        color: Ui.Theme.borderSubtle
    }
    Canvas {
        id: beams
        x: row.panel.nameWidth
        width: parent.width - x
        height: parent.height
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        Connections {
            target: row.panel
            enabled: !row.pooled
            function onRepaintRequested() {
                beams.requestPaint();
            }
        }
        onPaint: {
            const ctx = getContext("2d");
            ctx.reset();
            ctx.fillStyle = row.selected ? Ui.Theme.actionSelected : Ui.Theme.surfaceCanvas;
            ctx.fillRect(0, 0, width, height);
            const lane = row.lane, panel = row.panel;
            if (!lane || row.pooled) { return; }
            const settings = panel.laneSettings(lane), range = panel.laneRange(lane);
            const step = Tools.divisionTicks(panel.laneSettings(panel.selectedLane).grid);
            const end = panel.scrollTick + width / panel.pxPerTick;
            ctx.fillStyle = Ui.Theme.borderSubtle;
            for (const tick of step * panel.pxPerTick >= Ui.Metrics.xs ? Tools.stepLineTicks(panel.scrollTick, end, step, panel.phase) : []) {
                ctx.fillRect(Math.round((tick - panel.scrollTick) * panel.pxPerTick), 0, Ui.Metrics.border, height);
            }
            if (panel.midi.valid) {
                // Bar lines match the piano roll: the strong border at partial opacity.
                ctx.fillStyle = Ui.Theme.borderStrong;
                ctx.globalAlpha = 0.75;
                for (const tick of Tools.stepLineTicks(panel.scrollTick, end, panel.midi.gridStepTicks("bar"), panel.phase)) {
                    ctx.fillRect(Math.round((tick - panel.scrollTick) * panel.pxPerTick), 0, Ui.Metrics.border, height);
                }
                ctx.globalAlpha = 1;
            }
            ctx.fillStyle = Ui.Theme.borderSubtle;
            ctx.fillRect(0, height - Ui.Metrics.border, width, Ui.Metrics.border);
            const data = panel.laneData(lane);
            const zero = data && data.kind === "pitchBend" ? height * range.max / (range.max - range.min) : height;
            const selected = new Set(panel.selectedIds);
            for (const event of panel.eventsOf(lane)) {
                if (panel.tickOf(lane, event) < panel.midi.windowFromTick || panel.tickOf(lane, event) >= panel.midi.windowToTick) {
                    continue;
                }
                const x = (panel.tickOf(lane, event) - panel.scrollTick) * panel.pxPerTick;
                if (x + settings.penWidth < 0 || x > width) {
                    continue;
                }
                const value = panel.valueOf(lane, event);
                const y = lane.type === "note" ? height * (1 - value / 127) : height * (range.max - value) / (range.max - range.min);
                const beamHeight = Math.max(Ui.Metrics.border, Math.abs(zero - y));
                const top = data && data.kind === "pitchBend" ? Math.min(zero, y) : height - beamHeight;
                const rgb = lane.type === "note" ? Notes.velocityColor(value) : [Ui.Theme.accentPrimary.r * 255, Ui.Theme.accentPrimary.g * 255, Ui.Theme.accentPrimary.b * 255];
                const color = Notes.mixColor(rgb, [255, 255, 255], selected.has(event.id) ? 0.5 : 0);
                ctx.fillStyle = color;
                ctx.strokeStyle = selected.has(event.id) ? Ui.Theme.textPrimary : Notes.mixColor(rgb, [0, 0, 0], 0.35);
                ctx.lineWidth = Ui.Metrics.border;
                if (!event.muted) {
                    ctx.fillRect(Math.round(x), Math.round(top), settings.penWidth, Math.round(beamHeight));
                }
                if (settings.frames || event.muted) {
                    const inset = Ui.Metrics.border / 2;
                    ctx.strokeRect(Math.round(x) + inset, Math.round(top) + inset, Math.max(0, settings.penWidth - Ui.Metrics.border), Math.max(0, beamHeight - Ui.Metrics.border));
                }
            }
        }
    }
}
