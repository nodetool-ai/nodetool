import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import "primitives"
import "primitives/InspectorPrimitivesHelpers.js" as Helpers

Dialog {
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
    anchors.centerIn: Overlay.overlay
    width: 480
    padding: Theme.spacingXl
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
        spacing: Theme.spacingLg
        RowLayout {
            Layout.fillWidth: true
            spacing: Theme.spacingLg
            ColumnLayout {
                Layout.fillWidth: true
                Text { text: "Speed"; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall; color: Theme.textSecondary }
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
                Text { visible: !root.speedValid; text: "1–10000%"; font.pixelSize: Theme.fontSizeSmaller; color: Theme.error }
            }
            ColumnLayout {
                Layout.fillWidth: true
                Text { text: "Duration"; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall; color: Theme.textSecondary }
                TextField {
                    objectName: "dialogDuration"
                    Layout.fillWidth: true
                    implicitHeight: Theme.toolbarHeight
                    text: root.durationText
                    enabled: root.editingIds.length === 1
                    Accessible.name: "Duration"
                    font.family: Theme.monoFamily
                    font.pixelSize: Theme.fontSizeSmall
                    color: enabled ? Theme.textPrimary : Theme.textDisabled
                    padding: Theme.spacingMd
                    selectByMouse: true
                    background: Rectangle {
                        color: Theme.backgroundDefault
                        radius: Theme.radiusSm
                        border.width: 1
                        border.color: parent.activeFocus ? Theme.primary : Theme.overlay
                    }
                    onTextEdited: root.handleDuration(text)
                }
            }
        }
        CheckBox {
            text: "Ripple edit, shifting trailing clips"
            checked: root.ripple
            onToggled: root.ripple = checked
        }
        Text {
            Layout.fillWidth: true
            visible: root.editingIds.length > 1
            text: "All " + root.editingIds.length + " clips take this speed. Duration follows each clip's own length."
            wrapMode: Text.WordWrap
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmaller
            color: Theme.textSecondary
        }
    }
    footer: DialogButtonBox {
        Button { text: "Cancel"; DialogButtonBox.buttonRole: DialogButtonBox.RejectRole; onClicked: root.close() }
        Button { text: "Apply"; enabled: root.speedValid; DialogButtonBox.buttonRole: DialogButtonBox.AcceptRole; onClicked: root.apply() }
    }
}
