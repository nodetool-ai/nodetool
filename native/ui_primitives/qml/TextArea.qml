import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui
Basic.TextArea {
    id: root
    // Node and NodeEditing draw the node editor field frame: a quiet fill with no idle border. NodeEditing is the editor overlaid on a painted card field, which always shows its focus border.
    enum Variant { Field, Plain, Bubble, Code, Quiet, Node, NodeEditing }
    property int variant: 0
    property string value: ""
    property string accessibleName: ""
    property int role: Typography.SansBody
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
    font.family: Typography.family(role)
    font.pixelSize: Typography.pixelSize(role)
    font.weight: Typography.weight(role)
    color: enabled ? Theme.textPrimary : Theme.textDisabled
    placeholderTextColor: Theme.textSecondary
    selectionColor: Theme.accentPrimary
    selectedTextColor: Theme.textOnAccent
    padding: variant === 1 ? 0 : Metrics.md
    wrapMode: TextEdit.Wrap
    text: value
    background: Rectangle {
        color: root.variant === Ui.TextArea.Node ? (!root.enabled ? Theme.fieldSurfaceDisabled : root.activeFocus ? Theme.fieldSurfaceFocus : Theme.fieldSurface)
            : root.variant === Ui.TextArea.NodeEditing ? Theme.surfaceInput
            : root.variant === 1 || (root.variant === 4 && !root.hovered && !root.activeFocus) ? "transparent" : root.variant === 2 ? Theme.actionSelected : root.enabled ? Theme.surfaceInput : Theme.actionDisabled
        radius: Metrics.radiusControl
        border.width: root.variant === Ui.TextArea.NodeEditing ? Metrics.focus : root.variant === 1 || root.variant === 2 || (root.variant === 4 && !root.hovered && !root.activeFocus) ? 0 : root.activeFocus ? Metrics.focus : Metrics.border
        border.color: !root.valid ? Theme.borderError : root.variant === Ui.TextArea.NodeEditing || root.activeFocus ? Theme.borderFocus : root.variant === Ui.TextArea.Node ? "transparent" : Theme.borderControl
    }
    function cancelEdit() {
        if (!editing) return
        editing = false; text = value; editCanceled()
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
        }
    }
}
