// The editable timecode of the Program and Source monitors. Click to type a
// timecode, a frame form or a relative jump, or drag to scrub by frames. Enter
// commits, Escape restores, and invalid text never seeks.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: field
    property real timeMs: 0
    property real fps: 30
    property bool dropFrame: false
    property real maxMs: Number.MAX_VALUE
    property string accessibleName: "Timecode"
    property int tone: Ui.Text.Secondary
    signal seekRequested(real ms)

    readonly property string text: TimelineFormat.timecode(timeMs, fps, dropFrame)
    readonly property bool editing: editor.visible
    property bool scrubbing: false
    property real scrubBaselineMs: 0
    property real scrubBaselineFrame: 0
    property real pressX: 0

    implicitWidth: Math.max(display.implicitWidth, sizing.width) + Ui.Metrics.md * 2
    implicitHeight: TimelineMetrics.transportHeight - Ui.Metrics.sm
    activeFocusOnTab: true
    Accessible.role: Accessible.Button
    Accessible.name: accessibleName + " " + text
    Accessible.description: "Press Enter to type a time. Drag to move by frames."
    Accessible.onPressAction: beginEdit()

    function clamped(ms) { return Math.max(0, Math.min(maxMs, ms)) }
    function parsed(input) { return TimelineFormat.parseTimecode(input, fps, dropFrame, timeMs) }
    function beginEdit() {
        editor.value = text
        editor.text = text
        editor.visible = true
        editor.forceActiveFocus()
        editor.selectAll()
    }
    function endEdit() {
        if (!editor.visible) return
        const hadFocus = editor.activeFocus
        editor.visible = false
        if (hadFocus) field.forceActiveFocus()
    }
    function cancelScrub() {
        if (!scrubbing) return
        scrubbing = false
        seekRequested(scrubBaselineMs)
    }
    Keys.onPressed: event => {
        // A key the text field ignores, such as Left at its start, must not reach the editor's shortcuts.
        if (editing) {
            event.accepted = event.key !== Qt.Key_Tab && event.key !== Qt.Key_Backtab
        } else if (scrubbing && event.key === Qt.Key_Escape) {
            cancelScrub()
            event.accepted = true
        } else if (!editing && (event.key === Qt.Key_Return || event.key === Qt.Key_Enter)) {
            beginEdit()
            event.accepted = true
        }
    }

    TextMetrics {
        id: sizing
        font: display.font
        text: "00:00:00:00"
    }
    Rectangle {
        anchors.fill: parent
        visible: !editor.visible
        radius: Ui.Metrics.radiusControl
        color: pointer.pressed ? Ui.Theme.actionPressed : pointer.containsMouse ? Ui.Theme.actionSelected : "transparent"
        border.width: field.activeFocus ? Ui.Metrics.focus : 0
        border.color: Ui.Theme.borderFocus
    }
    Ui.Text {
        id: display
        objectName: "timecodeDisplay"
        anchors.centerIn: parent
        visible: !editor.visible
        text: field.text
        role: Ui.Typography.MonoLabel
        tone: field.tone
    }
    MouseArea {
        id: pointer
        objectName: "timecodeDragArea"
        anchors.fill: parent
        enabled: !editor.visible
        hoverEnabled: true
        preventStealing: true
        cursorShape: Qt.SizeHorCursor
        onPressed: mouse => {
            field.forceActiveFocus()
            field.pressX = mouse.x
            field.scrubBaselineMs = field.timeMs
            field.scrubBaselineFrame = TimelineFormat.frameAt(field.timeMs, field.fps)
        }
        onPositionChanged: mouse => {
            if (!pressed) return
            const dx = mouse.x - field.pressX
            if (!field.scrubbing) {
                if (Math.abs(dx) < Qt.styleHints.startDragDistance || field.scrubCancelled) return
                field.scrubbing = true
            }
            const step = (mouse.modifiers & Qt.ShiftModifier) ? 10 : 1
            const frame = field.scrubBaselineFrame + Math.round(dx) * step
            const ms = field.clamped(TimelineFormat.msAt(Math.max(0, frame), field.fps))
            if (TimelineFormat.frameAt(ms, field.fps) !== TimelineFormat.frameAt(field.timeMs, field.fps)) field.seekRequested(ms)
        }
        onReleased: {
            if (field.scrubbing) field.scrubbing = false
            else if (!field.scrubCancelled) field.beginEdit()
            field.scrubCancelled = false
        }
        onCanceled: {
            field.cancelScrub()
            field.scrubCancelled = false
        }
    }
    // Escape ends a scrub while the button is still down. The release must not open the editor.
    property bool scrubCancelled: false
    onScrubbingChanged: if (!scrubbing && pointer.pressed) scrubCancelled = true

    Ui.TextField {
        id: editor
        objectName: "timecodeEditor"
        anchors.fill: parent
        visible: false
        density: Ui.EditorButton.Compact
        accessibleName: field.accessibleName
        horizontalAlignment: TextInput.AlignHCenter
        valid: !isNaN(field.parsed(text))
        errorText: "Use a timecode such as 00:00:10:15, digits such as 1015, or a jump such as +10 or -5."
        onValueCommitted: input => {
            const ms = field.parsed(input)
            if (!isNaN(ms)) field.seekRequested(field.clamped(ms))
            field.endEdit()
        }
        onEditCanceled: field.endEdit()
        onAccepted: field.endEdit()
        // A connected Keys.onEscapePressed runs before the field's own Keys.onPressed.
        Keys.onEscapePressed: {
            cancelEdit()
            field.endEdit()
        }
        onActiveFocusChanged: if (!activeFocus) Qt.callLater(field.endEdit)
        Ui.Tooltip {
            trigger: editor
            visible: editor.visible && !editor.valid
            text: editor.errorText
        }
    }
}
