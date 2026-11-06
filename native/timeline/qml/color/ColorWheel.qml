pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "ColorWheelMath.js" as WheelMath
import NodeTool.UiPrimitives as Ui

// One grading wheel: a hue ring with a puck, and a lightness slider under it.
Column {
    id: root
    property string title: ""
    property string kind: "lift"
    property var values: []
    property bool disabled: false
    readonly property var state_: WheelMath.wheel(kind, values)
    property real draftX: 0
    property real draftY: 0
    property real pressX: 0
    property real pressY: 0
    property bool dragging: false
    readonly property real puckX: dragging ? draftX : WheelMath.clampToDisc(state_.x, state_.y).x
    readonly property real puckY: dragging ? draftY : WheelMath.clampToDisc(state_.x, state_.y).y
    signal gestureStarted
    signal gestureCancelled
    signal patch(var values, string phase)
    spacing: Ui.Metrics.xs
    function emitWheel(x, y, phase) {
        root.patch(WheelMath.channels(root.kind, x, y, root.state_.lightness), phase);
    }
    onDisabledChanged: if (disabled && dragging) {
        dragging = false;
        dial.keying = false;
        gestureCancelled();
    }
    Ui.Text {
        width: parent.width
        text: root.title
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Secondary
        horizontalAlignment: Text.AlignHCenter
    }
    Item {
        id: dial
        objectName: "colorWheelDial_" + root.kind
        width: parent.width
        height: width
        activeFocusOnTab: !root.disabled
        Accessible.role: Accessible.Dial
        Accessible.name: root.title + " color wheel"
        Accessible.description: "Arrow keys move the puck. Delete resets it."
        readonly property real ringRadius: width / 2 - Ui.Metrics.xs
        property bool keying: false
        // A held arrow key is one gesture, like a drag: it previews, and writes on release.
        function nudge(dx, dy) {
            if (root.disabled)
                return;
            if (!keying) {
                keying = true;
                root.draftX = root.puckX;
                root.draftY = root.puckY;
                root.dragging = true;
                root.gestureStarted();
            }
            const next = WheelMath.clampToDisc(root.draftX + dx, root.draftY + dy);
            root.draftX = next.x;
            root.draftY = next.y;
            root.emitWheel(next.x, next.y, "preview");
        }
        function finishKeys() {
            if (!keying)
                return;
            keying = false;
            root.dragging = false;
            root.emitWheel(root.draftX, root.draftY, "commit");
        }
        Keys.onLeftPressed: nudge(-0.02, 0)
        Keys.onRightPressed: nudge(0.02, 0)
        Keys.onUpPressed: nudge(0, 0.02)
        Keys.onDownPressed: nudge(0, -0.02)
        Keys.onDeletePressed: if (!root.disabled && !keying)
            root.emitWheel(0, 0, "apply")
        Keys.onEscapePressed: event => {
            event.accepted = keying;
            if (!keying)
                return;
            keying = false;
            root.dragging = false;
            root.gestureCancelled();
        }
        Keys.onReleased: event => {
            if (!event.isAutoRepeat && (event.key === Qt.Key_Left || event.key === Qt.Key_Right || event.key === Qt.Key_Up || event.key === Qt.Key_Down))
                finishKeys();
        }
        onActiveFocusChanged: if (!activeFocus)
            finishKeys()
        Canvas {
            id: ring
            anchors.fill: parent
            opacity: root.disabled ? 0.4 : 1
            onWidthChanged: requestPaint()
            onHeightChanged: requestPaint()
            onPaint: {
                const context = getContext("2d");
                context.reset();
                const center = width / 2;
                const outer = dial.ringRadius;
                const lineWidth = Ui.Metrics.sm;
                context.lineWidth = lineWidth;
                for (let deg = 0; deg < 360; deg += 3) {
                    context.beginPath();
                    context.strokeStyle = WheelMath.ringColor(deg);
                    // Canvas angles run clockwise from +x, so the ring is mirrored here.
                    context.arc(center, center, outer - lineWidth / 2, -(deg + 3.5) * Math.PI / 180, -deg * Math.PI / 180);
                    context.stroke();
                }
            }
        }
        Rectangle {
            anchors.centerIn: parent
            width: Ui.Metrics.sm
            height: Ui.Metrics.sm
            radius: Ui.Metrics.radiusPill
            color: Ui.Theme.borderControl
        }
        Rectangle {
            objectName: "colorWheelPuck_" + root.kind
            readonly property real reach: dial.ringRadius - Ui.Metrics.sm - width / 2
            x: dial.width / 2 + root.puckX * reach - width / 2
            y: dial.height / 2 - root.puckY * reach - height / 2
            width: Ui.Metrics.lg
            height: Ui.Metrics.lg
            radius: Ui.Metrics.radiusPill
            color: Ui.Theme.textPrimary
            border.width: dial.activeFocus ? Ui.Metrics.focus : Ui.Metrics.border
            border.color: dial.activeFocus ? Ui.Theme.borderFocus : Ui.Theme.surfaceCanvas
        }
        MouseArea {
            anchors.fill: parent
            enabled: !root.disabled
            preventStealing: true
            property point pressedAt
            // The puck moves by the pointer's travel, so a click alone changes nothing.
            function move(mouse, phase) {
                const reach = Math.max(1, dial.ringRadius - Ui.Metrics.sm - Ui.Metrics.lg / 2);
                const next = WheelMath.clampToDisc(root.pressX + (mouse.x - pressedAt.x) / reach, root.pressY - (mouse.y - pressedAt.y) / reach);
                root.draftX = next.x;
                root.draftY = next.y;
                root.emitWheel(next.x, next.y, phase);
            }
            onPressed: mouse => {
                dial.forceActiveFocus();
                pressedAt = Qt.point(mouse.x, mouse.y);
                root.pressX = root.puckX;
                root.pressY = root.puckY;
            }
            onPositionChanged: mouse => {
                if (!root.dragging) {
                    if (Math.hypot(mouse.x - pressedAt.x, mouse.y - pressedAt.y) < Ui.Metrics.xs)
                        return;
                    root.draftX = root.pressX;
                    root.draftY = root.pressY;
                    root.dragging = true;
                    root.gestureStarted();
                }
                move(mouse, "preview");
            }
            onReleased: mouse => {
                if (!root.dragging)
                    return;
                move(mouse, "commit");
                root.dragging = false;
            }
            onCanceled: {
                if (!root.dragging)
                    return;
                root.dragging = false;
                root.gestureCancelled();
            }
            onDoubleClicked: root.emitWheel(0, 0, "apply")
        }
    }
    Ui.Slider {
        objectName: "colorWheelLightness_" + root.kind
        width: parent.width
        density: Ui.EditorButton.Compact
        from: -1
        to: 1
        stepSize: 0.01
        origin: 0
        resetValue: 0
        resetOnDoubleTap: true
        enabled: !root.disabled
        accessibleName: root.title + " lightness"
        value: Math.max(-1, Math.min(1, root.state_.lightness))
        onEditStarted: root.gestureStarted()
        onValuePreviewed: next => root.patch(WheelMath.channels(root.kind, root.state_.x, root.state_.y, next), "preview")
        onValueCommitted: next => root.patch(WheelMath.channels(root.kind, root.state_.x, root.state_.y, next), "commit")
        onEditCanceled: root.gestureCancelled()
    }
}
