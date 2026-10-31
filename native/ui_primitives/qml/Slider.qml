import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui
FocusScope {
    id: root
    property real value: 0
    property real from: 0
    property real to: 1
    property real stepSize: 0
    property real origin: from
    property real resetValue: origin
    property bool resetOnDoubleTap: false
    property string accessibleName: ""
    property int density: Ui.EditorButton.Standard
    property bool editing: false
    property real draft: value
    signal editStarted()
    signal valuePreviewed(real value)
    signal valueCommitted(real value)
    signal editCanceled()
    implicitHeight: density === Ui.EditorButton.Compact ? Metrics.compact : Metrics.standard
    implicitWidth: Metrics.xxxl * 4
    activeFocusOnTab: enabled
    function begin() { if (!editing) { editing = true; draft = value; editStarted() } }
    function finish() {
        tapCommitTimer.stop()
        resetTap.previousTapAt = 0
        resetTap.doubleTapPending = false
        if (!editing) return
        const next = draft; editing = false; valueCommitted(next)
    }
    function cancel() { tapCommitTimer.stop(); resetTap.previousTapAt = 0; resetTap.doubleTapPending = false; if (editing) { editing = false; editCanceled() } }
    function reset() { begin(); draft = Math.max(Math.min(from, to), Math.min(Math.max(from, to), resetValue)); valuePreviewed(draft); finish() }
    onEnabledChanged: if (!enabled) cancel()
    onActiveFocusChanged: if (!activeFocus && editing) { if (enabled) finish(); else cancel() }
    Timer { id: tapCommitTimer; interval: Qt.styleHints.mouseDoubleClickInterval; onTriggered: root.finish() }
    Basic.Slider {
        id: control
        objectName: "nativeSliderControl"
        anchors.fill: parent
        focus: true
        from: root.from; to: root.to; stepSize: root.stepSize
        value: root.editing ? root.draft : root.value
        Accessible.name: root.accessibleName
        onMoved: { const next = value; root.begin(); root.draft = next; root.valuePreviewed(next) }
        onPressedChanged: {
            if (pressed) {
                resetTap.tappedThisRelease = false
                forceActiveFocus(Qt.MouseFocusReason)
            } else if (!enabled) root.cancel()
            else if (root.resetOnDoubleTap) Qt.callLater(() => {
                if (resetTap.doubleTapPending) {
                    resetTap.doubleTapPending = false
                    root.reset()
                } else if (!root.editing) return
                else if (resetTap.tappedThisRelease) tapCommitTimer.restart()
                else root.finish()
            })
            else root.finish()
        }
        Keys.onReleased: event => { if (!event.isAutoRepeat && [Qt.Key_Left, Qt.Key_Right, Qt.Key_Up, Qt.Key_Down, Qt.Key_Home, Qt.Key_End].includes(event.key)) root.finish() }
        Keys.onEscapePressed: event => { if (root.editing) { root.cancel(); event.accepted = true } }
        TapHandler {
            id: resetTap
            enabled: root.resetOnDoubleTap && root.enabled
            property double previousTapAt: 0
            property point previousPosition: Qt.point(0, 0)
            property bool tappedThisRelease: false
            property bool doubleTapPending: false
            onTapped: eventPoint => {
                tappedThisRelease = true
                const now = Date.now()
                const position = eventPoint.position
                const dx = position.x - previousPosition.x
                const dy = position.y - previousPosition.y
                const close = dx * dx + dy * dy <= Qt.styleHints.startDragDistance * Qt.styleHints.startDragDistance
                if (previousTapAt > 0 && now - previousTapAt <= Qt.styleHints.mouseDoubleClickInterval && close) {
                    previousTapAt = 0
                    doubleTapPending = true
                } else {
                    previousTapAt = now
                    previousPosition = position
                }
            }
        }
        background: Rectangle {
            x: control.leftPadding; y: control.topPadding + control.availableHeight / 2 - height / 2
            width: control.availableWidth; height: Metrics.xs; radius: Metrics.micro; color: Theme.borderControl
            Rectangle { width: control.visualPosition * parent.width; height: parent.height; radius: parent.radius; color: Theme.accentPrimary }
            Rectangle { x: root.to === root.from ? 0 : Math.max(0, Math.min(1, (root.origin - root.from) / (root.to - root.from))) * parent.width - width / 2; width: Metrics.border; height: parent.height; color: Theme.textPrimary }
        }
        handle: Rectangle {
            x: control.leftPadding + control.visualPosition * (control.availableWidth - width)
            y: control.topPadding + control.availableHeight / 2 - height / 2
            implicitWidth: Metrics.iconSm; implicitHeight: Metrics.iconSm; radius: width / 2
            color: Theme.textPrimary; border.width: control.visualFocus ? Metrics.focus : Metrics.border
            border.color: control.visualFocus ? Theme.borderFocus : Theme.borderControl
        }
    }
}
