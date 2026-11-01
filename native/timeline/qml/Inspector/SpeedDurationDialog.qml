import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import "primitives"
import "primitives/InspectorPrimitivesHelpers.js" as Helpers
import NodeTool.UiPrimitives as Ui

Ui.Dialog {
    id: root
    objectName: "speedDurationDialog"
    required property SpeedController controller
    property var clipIds: []
    property bool linked: true
    property var editingIds: []
    property var first: null
    property real sourceSpanMs: 0
    property string speedText: "100"
    property string durationText: ""
    property bool ripple: false
    readonly property real fps: controller.model ? controller.model.fps : 30
    readonly property bool speedValid: Number.isFinite(Number(speedText)) && Number(speedText) >= 1 && Number(speedText) <= 10000
    title: "Clip speed / duration"
    modal: true
    width: parent ? Math.min(Ui.Metrics.dialogCompactWidth, parent.width - 2 * Ui.Metrics.dialogNarrowInset) : Ui.Metrics.dialogCompactWidth
    closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
    function openForSelection() {
        editingIds = clipIds.slice()
        first = (controller.document.clips || []).find(c => c.id === editingIds[0]) || null
        const rate = first ? (first.speedBaked ? 1 : Math.max(0.0001, first.speedMultiplier ?? 1)) : 1
        sourceSpanMs = first ? first.durationMs * rate : 0
        speedText = String(Math.round(rate * 1000) / 10)
        durationText = Helpers.formatTimecode(first ? first.durationMs : 0, fps)
        ripple = false
        open()
    }
    function handleSpeed(raw) {
        speedText = raw
        const pct = Number(raw)
        if (Number.isFinite(pct) && pct > 0 && sourceSpanMs > 0) durationText = Helpers.formatTimecode(sourceSpanMs / (pct / 100), fps)
    }
    function handleDuration(raw) {
        durationText = raw
        const ms = controller.parseDuration(raw, fps, first ? first.durationMs : 0)
        if (ms !== undefined && ms !== null && ms > 0 && sourceSpanMs > 0) speedText = String(Math.round(sourceSpanMs / ms * 1000) / 10)
    }
    function apply() {
        if (!speedValid) return
        controller.apply("setClipsSpeed", {clipIds: editingIds, speedMultiplier: Number(speedText) / 100, ripple: ripple, linked: linked})
        close()
    }
    contentItem: ColumnLayout {
        spacing: Ui.Metrics.lg
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.lg
            ColumnLayout {
                Layout.fillWidth: true
                Ui.Text { text: "Speed"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                InspectorPillInput {
                    objectName: "dialogSpeed"
                    Layout.fillWidth: true
                    onDraftChanged: if (typed) root.handleSpeed(draft)
                    size: "medium"
                    value: root.speedText
                    ariaLabel: "Speed"
                    unit: "%"
                    scrub: ({step: 1, min: 1, max: 10000})
                    onPreview: raw => root.handleSpeed(raw)
                    onCommit: raw => root.handleSpeed(raw)
                }
                Ui.Text { visible: !root.speedValid; text: "1–10000%"; role: Ui.Typography.SansCaption; tone: Ui.Text.Error }
            }
            ColumnLayout {
                Layout.fillWidth: true
                Ui.Text { text: "Duration"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                Ui.TextField {
                    objectName: "dialogDuration"
                    Layout.fillWidth: true
                    value: root.durationText
                    enabled: root.editingIds.length === 1
                    accessibleName: "Duration"
                    selectByMouse: true
                    onValuePreviewed: value => root.handleDuration(value)
                    onValueCommitted: value => root.handleDuration(value)
                }
            }
        }
        Ui.CheckBox {
            id: rippleBox
            text: "Ripple edit, shifting trailing clips"
            Binding { target: rippleBox; property: "checked"; value: root.ripple }
            onCheckedChangedByUser: checked => root.ripple = checked
        }
        Ui.Text {
            Layout.fillWidth: true
            visible: root.editingIds.length > 1
            text: "All " + root.editingIds.length + " clips take this speed. Duration follows each clip's own length."
            wrapMode: Text.WordWrap
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
        }
    }
    footer: Row {
        spacing: Ui.Metrics.md
        Ui.EditorButton { text: "Cancel"; onClicked: root.close() }
        Ui.EditorButton { text: "Apply"; enabled: root.speedValid; variant: Ui.EditorButton.Primary; onClicked: root.apply() }
    }
}
