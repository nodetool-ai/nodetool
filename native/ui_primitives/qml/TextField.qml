import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui
Basic.TextField {
    id: root
    // Node and NodeEditing draw the node editor field frame: a quiet fill with no idle border. NodeEditing is the editor overlaid on a painted card field, which always shows its focus border.
    enum Variant { Field, Node, NodeEditing }
    property int variant: Ui.TextField.Field
    readonly property bool nodeFrame: variant !== Ui.TextField.Field
    property string value: ""
    property string accessibleName: ""
    property string suffix: ""
    property string leadingIcon: ""
    property bool clearable: false
    property bool handleEscape: true
    property bool handleReturn: true
    property int role: Typography.SansLabel
    property bool valid: true
    property string errorText: ""
    property int density: Ui.EditorButton.Standard
    property bool editing: false
    property string editBaseline: ""
    readonly property bool hasLeadingIcon: leadingIcon !== ""
    readonly property bool hasClearButton: clearable && enabled && !readOnly && text.length > 0
    readonly property real leadingInset: hasLeadingIcon ? Metrics.md + Metrics.iconSm + Metrics.sm : Metrics.md
    readonly property real trailingInset: suffixLabel.visible && hasClearButton
        ? suffixLabel.width + Metrics.small + Metrics.md * 2 + Metrics.xs
        : suffixLabel.visible ? suffixLabel.width + Metrics.md * 2
        : hasClearButton ? Metrics.small + Metrics.md
        : Metrics.md
    signal editStarted()
    signal valuePreviewed(string value)
    signal valueCommitted(string value)
    signal editCanceled()
    Accessible.name: accessibleName
    Accessible.description: valid ? "" : errorText
    implicitHeight: Math.max(density === Ui.EditorButton.Compact ? Metrics.compact : density === Ui.EditorButton.Comfortable ? Metrics.comfortable : Metrics.standard, contentHeight + Metrics.md)
    leftPadding: root.LayoutMirroring.enabled ? trailingInset : leadingInset
    rightPadding: root.LayoutMirroring.enabled ? leadingInset : trailingInset
    topPadding: Metrics.xs; bottomPadding: Metrics.xs
    font.family: Typography.family(role)
    font.pixelSize: Typography.pixelSize(role)
    font.weight: Typography.weight(role)
    color: enabled ? Theme.textPrimary : Theme.textDisabled
    placeholderTextColor: Theme.textSecondary
    selectionColor: Theme.accentPrimary
    selectedTextColor: Theme.textOnAccent
    text: value
    Ui.Icon {
        id: leadingGlyph
        LayoutMirroring.enabled: false
        visible: root.hasLeadingIcon
        name: root.leadingIcon
        size: Metrics.iconSm
        tone: !root.enabled ? Ui.Text.Disabled : root.activeFocus ? Ui.Text.Primary : Ui.Text.Secondary
        anchors.left: root.LayoutMirroring.enabled ? undefined : parent.left
        anchors.right: root.LayoutMirroring.enabled ? parent.right : undefined
        anchors.leftMargin: Metrics.md
        anchors.rightMargin: Metrics.md
        anchors.verticalCenter: parent.verticalCenter
    }
    Ui.Text { id: suffixLabel; LayoutMirroring.enabled: false; anchors.left: root.LayoutMirroring.enabled ? parent.left : undefined; anchors.right: root.LayoutMirroring.enabled ? undefined : parent.right; anchors.leftMargin: root.hasClearButton ? Metrics.small + Metrics.md : Metrics.md; anchors.rightMargin: root.hasClearButton ? Metrics.small + Metrics.md : Metrics.md; anchors.verticalCenter: parent.verticalCenter; text: root.suffix; visible: text !== ""; role: Typography.SansCaption; tone: Ui.Text.Secondary }
    Ui.ToolbarIconButton {
        id: clearButton
        objectName: "textFieldClear"
        LayoutMirroring.enabled: false
        visible: root.hasClearButton
        iconName: "close"
        iconSize: Metrics.iconXs
        implicitWidth: Metrics.small
        implicitHeight: Metrics.small
        focusPolicy: Qt.NoFocus
        accessibleName: qsTr("Clear")
        anchors.left: root.LayoutMirroring.enabled ? parent.left : undefined
        anchors.right: root.LayoutMirroring.enabled ? undefined : parent.right
        anchors.leftMargin: Metrics.xs
        anchors.rightMargin: Metrics.xs
        anchors.verticalCenter: parent.verticalCenter
        onClicked: root.clearField()
    }
    background: Rectangle {
        color: root.variant === Ui.TextField.Node ? (!root.enabled ? Theme.fieldSurfaceDisabled : root.activeFocus ? Theme.fieldSurfaceFocus : Theme.fieldSurface)
            : root.variant === Ui.TextField.NodeEditing ? Theme.surfaceInput
            : root.enabled ? Theme.surfaceInput : Theme.actionDisabled
        radius: Metrics.radiusControl
        border.width: root.variant === Ui.TextField.NodeEditing || root.activeFocus ? Metrics.focus : Metrics.border
        border.color: !root.valid ? Theme.borderError : root.variant === Ui.TextField.NodeEditing || root.activeFocus ? Theme.borderFocus : root.nodeFrame ? "transparent" : Theme.borderControl
    }
    function clearField() {
        editing = false
        text = ""
        valuePreviewed("")
        valueCommitted("")
        forceActiveFocus(Qt.OtherFocusReason)
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
        if (root.handleEscape && event.key === Qt.Key_Escape && editing && !inputMethodComposing) {
            cancelEdit(); event.accepted = true
        } else if (root.handleReturn && (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && !inputMethodComposing) {
            if (valid) { finishEdit(); accepted() }
            event.accepted = true
        }
    }
}
