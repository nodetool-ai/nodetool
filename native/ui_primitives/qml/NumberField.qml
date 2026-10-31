import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui
Basic.TextField {
    id: root
    property real value: 0
    property string displayValue: String(value)
    property string accessibleName: ""
    property string unit: ""
    property real from: -Infinity
    property real to: Infinity
    property real stepSize: 1
    property bool valid: true
    property string errorText: ""
    property int density: Ui.EditorButton.Standard
    property bool editing: false
    property real editBaseline: 0
    readonly property bool draftValid: text.trim() !== "" && Number.isFinite(Number(text)) && Number(text) >= from && Number(text) <= to
    signal editStarted()
    signal valuePreviewed(real value)
    signal valueCommitted(real value)
    signal editCanceled()
    Accessible.name: accessibleName
    Accessible.description: valid && draftValid ? unit : errorText
    implicitHeight: Math.max(density === Ui.EditorButton.Compact ? Metrics.compact : density === Ui.EditorButton.Comfortable ? Metrics.comfortable : Metrics.standard, contentHeight + Metrics.md)
    leftPadding: root.LayoutMirroring.enabled && unitLabel.visible ? unitLabel.width + Metrics.md * 2 : Metrics.md
    rightPadding: !root.LayoutMirroring.enabled && unitLabel.visible ? unitLabel.width + Metrics.md * 2 : Metrics.md
    topPadding: Metrics.xs; bottomPadding: Metrics.xs
    font.family: Typography.family(Typography.MonoLabel)
    font.pixelSize: Typography.pixelSize(Typography.MonoLabel)
    font.weight: Typography.weight(Typography.MonoLabel)
    color: enabled ? Theme.textPrimary : Theme.textDisabled
    selectionColor: Theme.accentPrimary; selectedTextColor: Theme.textOnAccent
    text: displayValue
    Ui.Text { id: unitLabel; LayoutMirroring.enabled: false; anchors.left: root.LayoutMirroring.enabled ? parent.left : undefined; anchors.right: root.LayoutMirroring.enabled ? undefined : parent.right; anchors.leftMargin: Metrics.md; anchors.rightMargin: Metrics.md; anchors.verticalCenter: parent.verticalCenter; text: root.unit; visible: text !== ""; role: Typography.SansCaption; tone: Ui.Text.Secondary }
    background: Rectangle {
        color: root.enabled ? Theme.surfaceInput : Theme.actionDisabled; radius: Metrics.radiusControl
        border.width: root.activeFocus ? Metrics.focus : Metrics.border
        border.color: !root.valid || !root.draftValid ? Theme.borderError : root.activeFocus ? Theme.borderFocus : Theme.borderControl
    }
    function isValidDraft() { const n = Number(text); return text.trim() !== "" && Number.isFinite(n) && n >= from && n <= to }
    function begin() { if (!editing) { editBaseline = value; editing = true; editStarted() } }
    function cancelEdit() { if (editing) { editing = false; text = displayValue; editCanceled() } }
    function finishEdit() {
        if (!editing || !valid || !draftValid) return
        const next = Number(text); editing = false
        if (next !== editBaseline) valueCommitted(next); else editCanceled()
    }
    onTextEdited: { begin(); if (isValidDraft()) valuePreviewed(Number(text)) }
    onDisplayValueChanged: if (!editing) text = displayValue
    onActiveFocusChanged: if (!activeFocus) { if (valid && isValidDraft()) finishEdit(); else cancelEdit() }
    onEnabledChanged: if (!enabled) cancelEdit()
    onReadOnlyChanged: if (readOnly) cancelEdit()
    Keys.priority: Keys.BeforeItem
    Keys.onPressed: event => {
        if (inputMethodComposing) return
        if (event.key === Qt.Key_Escape && editing) { cancelEdit(); event.accepted = true; return }
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) { finishEdit(); event.accepted = true; return }
        if (!readOnly && (event.key === Qt.Key_Up || event.key === Qt.Key_Down)) {
            begin()
            const factor = event.modifiers & Qt.ShiftModifier ? 10 : event.modifiers & Qt.AltModifier ? 0.1 : 1
            const next = Math.max(from, Math.min(to, (draftValid ? Number(text) : value) + (event.key === Qt.Key_Up ? 1 : -1) * stepSize * factor))
            text = String(next); valuePreviewed(next); event.accepted = true
        }
    }
    Keys.onReleased: event => { if (editing && !event.isAutoRepeat && (event.key === Qt.Key_Up || event.key === Qt.Key_Down)) { finishEdit(); event.accepted = true } }
}
