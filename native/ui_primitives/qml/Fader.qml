pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.UiPrimitives as Ui
Item {
    id: root
    property real value: 0
    property var marks: []
    property string accessibleName: ""
    property string accessibleValueText: ""
    property real stepSize: 0.01
    property real resetValue: 0
    property bool editing: false
    property bool customEndKey: false
    property real draft: value
    property real grabOffset: 0
    property real lastY: 0
    signal editStarted()
    signal valuePreviewed(real value)
    signal valueCommitted(real value)
    signal editCanceled()
    signal endKeyRequested()
    activeFocusOnTab: enabled
    Accessible.role: Accessible.Slider
    Accessible.name: accessibleName
    Accessible.description: accessibleValueText
    Accessible.onIncreaseAction: { if (enabled) { begin(); preview(draft + stepSize); finish() } }
    Accessible.onDecreaseAction: { if (enabled) { begin(); preview(draft - stepSize); finish() } }
    function clamp(v) { return Math.max(0, Math.min(1, v)) }
    function positionAt(y) { return clamp(1 - (y - Metrics.sm - Metrics.xs) / Math.max(1, height - 2 * (Metrics.sm + Metrics.xs))) }
    function begin() { if (!editing) { editing = true; draft = value; editStarted() } }
    function preview(v) { draft = clamp(v); valuePreviewed(draft) }
    function finish() { if (editing) { editing = false; valueCommitted(draft) } }
    function cancel() { if (editing) { editing = false; editCanceled() } }
    onActiveFocusChanged: if (!activeFocus && editing) { if (enabled) finish(); else cancel() }
    onEnabledChanged: if (!enabled) cancel()
    Keys.onPressed: event => {
        if (event.key === Qt.Key_Escape && editing) { cancel(); event.accepted = true; return }
        if (event.key === Qt.Key_End && customEndKey) { endKeyRequested(); event.accepted = true; return }
        let next = editing ? draft : value
        const step = stepSize * ((event.modifiers & Qt.ShiftModifier) ? 0.1 : 1)
        switch (event.key) {
        case Qt.Key_Up: case Qt.Key_Right: next += step; break
        case Qt.Key_Down: case Qt.Key_Left: next -= step; break
        case Qt.Key_PageUp: next += 0.1; break
        case Qt.Key_PageDown: next -= 0.1; break
        case Qt.Key_Home: next = 0; break
        case Qt.Key_End: next = 1; break
        case Qt.Key_Delete: case Qt.Key_Backspace: next = resetValue; break
        default: return
        }
        begin(); preview(next); event.accepted = true
    }
    Keys.onReleased: event => { if (editing && !event.isAutoRepeat && [Qt.Key_Up, Qt.Key_Down, Qt.Key_Left, Qt.Key_Right, Qt.Key_PageUp, Qt.Key_PageDown, Qt.Key_Home, Qt.Key_End, Qt.Key_Delete, Qt.Key_Backspace].includes(event.key)) { finish(); event.accepted = true } }
    Rectangle { x: Metrics.lg; y: Metrics.sm + Metrics.xs; width: Metrics.xs; height: Math.max(0, parent.height - 2 * y); radius: Metrics.micro; color: Theme.borderControl }
    Repeater {
        model: root.marks
        delegate: Ui.Text {
            required property var modelData
            x: Metrics.compact; y: Metrics.sm + Metrics.xs + (root.height - 2 * (Metrics.sm + Metrics.xs)) * (1 - modelData.position) - height / 2
            text: modelData.label; role: Typography.MonoCaption; tone: Ui.Text.Secondary
        }
    }
    Rectangle {
        id: cap
        x: 0; y: (root.height - height) * (1 - (root.editing ? root.draft : root.value))
        width: Metrics.compact; height: Metrics.iconLg; radius: Metrics.xs
        color: Theme.textPrimary; border.width: root.activeFocus ? Metrics.focus : Metrics.border
        border.color: root.activeFocus ? Theme.borderFocus : Theme.borderControl
    }
    MouseArea {
        anchors.fill: parent; cursorShape: Qt.SizeVerCursor
        onPressed: event => {
            root.forceActiveFocus(); root.begin(); root.lastY = event.y
            const onCap = event.x <= cap.width && event.y >= cap.y && event.y <= cap.y + cap.height
            root.grabOffset = onCap ? root.positionAt(event.y) - root.draft : 0
            if (!onCap) root.preview(root.positionAt(event.y))
        }
        onPositionChanged: event => {
            if (!root.editing || !pressed) return
            if (event.modifiers & Qt.ShiftModifier) {
                const next = root.draft + (root.lastY - event.y) / Math.max(1, root.height - cap.height) / 10
                root.grabOffset = root.positionAt(event.y) - next
                root.preview(next)
            } else root.preview(root.positionAt(event.y) - root.grabOffset)
            root.lastY = event.y
        }
        onReleased: root.finish()
        onCanceled: root.cancel()
        onDoubleClicked: { root.begin(); root.preview(root.resetValue); root.finish() }
    }
}
