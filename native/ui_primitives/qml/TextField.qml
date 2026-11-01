import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui
Basic.TextField {
    id: root
    property string value: ""
    property string accessibleName: ""
    property string suffix: ""
    property bool valid: true
    property string errorText: ""
    property int density: Ui.EditorButton.Standard
    property bool editing: false
    property string editBaseline: ""
    signal editStarted()
    signal valuePreviewed(string value)
    signal valueCommitted(string value)
    signal editCanceled()
    Accessible.name: accessibleName
    Accessible.description: valid ? "" : errorText
    implicitHeight: Math.max(density === Ui.EditorButton.Compact ? Metrics.compact : density === Ui.EditorButton.Comfortable ? Metrics.comfortable : Metrics.standard, contentHeight + Metrics.md)
    leftPadding: root.LayoutMirroring.enabled && suffixLabel.visible ? suffixLabel.width + Metrics.md * 2 : Metrics.md
    rightPadding: !root.LayoutMirroring.enabled && suffixLabel.visible ? suffixLabel.width + Metrics.md * 2 : Metrics.md
    topPadding: Metrics.xs; bottomPadding: Metrics.xs
    font.family: Typography.family(Typography.SansLabel)
    font.pixelSize: Typography.pixelSize(Typography.SansLabel)
    font.weight: Typography.weight(Typography.SansLabel)
    color: enabled ? Theme.textPrimary : Theme.textDisabled
    placeholderTextColor: Theme.textSecondary
    selectionColor: Theme.accentPrimary
    selectedTextColor: Theme.textOnAccent
    text: value
    Ui.Text { id: suffixLabel; LayoutMirroring.enabled: false; anchors.left: root.LayoutMirroring.enabled ? parent.left : undefined; anchors.right: root.LayoutMirroring.enabled ? undefined : parent.right; anchors.leftMargin: Metrics.md; anchors.rightMargin: Metrics.md; anchors.verticalCenter: parent.verticalCenter; text: root.suffix; visible: text !== ""; role: Typography.SansCaption; tone: Ui.Text.Secondary }
    background: Rectangle {
        color: root.enabled ? Theme.surfaceInput : Theme.actionDisabled
        radius: Metrics.radiusControl
        border.width: root.activeFocus ? Metrics.focus : Metrics.border
        border.color: !root.valid ? Theme.borderError : root.activeFocus ? Theme.borderFocus : Theme.borderControl
    }
    function cancelEdit() {
        if (!editing) return
        editing = false
        text = value
        editCanceled()
    }
    function finishEdit() {
        if (!editing || !valid) return
        editing = false
        if (text !== editBaseline) valueCommitted(text)
        else editCanceled()
    }
    onTextEdited: {
        if (!editing) { editBaseline = value; editing = true; editStarted() }
        valuePreviewed(text)
    }
    onValueChanged: if (!editing) text = value
    onActiveFocusChanged: if (!activeFocus) { if (valid) finishEdit(); else cancelEdit() }
    onEnabledChanged: if (!enabled) cancelEdit()
    onReadOnlyChanged: if (readOnly) cancelEdit()
    Keys.priority: Keys.BeforeItem
    Keys.onPressed: event => {
        if (event.key === Qt.Key_Escape && editing && !inputMethodComposing) {
            cancelEdit(); event.accepted = true
        } else if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && !inputMethodComposing) {
            if (valid) { finishEdit(); accepted() }
            event.accepted = true
        }
    }
}
