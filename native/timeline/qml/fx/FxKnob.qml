import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "FxParams.js" as Params

// fxBase.css: --panel-lo/body -> backgroundPaper, --line/track -> divider,
// --text/pointer -> textPrimary, --text-dim -> textSecondary,
// --ac-a/b/f/n -> info/warning/secondary/primary. Fonts -> monoFamily.
Item {
    id: root
    property var def: ({id:"", min:0, max:1, def:0})
    property real value: 0
    property string size: "sm"
    property string accent: "n"
    property string label: def.label ?? ""
    signal change(real value)
    // QML reserves `set`. Keep React's onSet callback and expose setValue
    // for QML signal consumers (onSetValue).
    property var onSet: function(value) {}
    signal setValue(real value)
    function requestSet(value) { onSet(value); setValue(value) }
    signal gestureEnd()
    signal gestureCanceled()
    readonly property color accentColor: accent === "a" ? Ui.Theme.statusInfo : accent === "b" ? Ui.Theme.statusWarning : accent === "f" ? TimelineVisuals.overlay : Ui.Theme.accentPrimary
    readonly property real diameter: size === "lg" ? 74 : size === "md" ? 56 : size === "xs" ? 34 : 44
    readonly property real norm: Math.min(1, Math.max(0, Params.valueToNorm(def, value)))
    readonly property real degrees: -135 + 270 * norm
    readonly property real arcStart: (def.min ?? 0) < 0 ? -135 + 270 * Params.valueToNorm(def, 0) : -135
    readonly property string valueText: typeof def.fmt === "function" ? def.fmt(value) : value.toFixed(2)
    property real gestureNorm: norm
    property real lastY: 0
    property bool dragging: false
    implicitWidth: diameter
    implicitHeight: diameter + (size === "xs" ? 0 : labelText.implicitHeight + Ui.Metrics.xs) + valueLabel.implicitHeight + Ui.Metrics.micro
    activeFocusOnTab: true
    Accessible.role: Accessible.Slider
    Accessible.name: label || def.id || ""
    Accessible.description: valueText
    onNormChanged: { if (!dragging) gestureNorm = norm }
    function cancelGesture() {
        if (!dragging) return
        dragging = false
        gestureCanceled()
        gestureNorm = norm
    }
    onEnabledChanged: if (!enabled) cancelGesture()
    onActiveFocusChanged: { if (!activeFocus) { if (dragging) cancelGesture(); else gestureEnd() } }
    function nudge(delta) {
        gestureNorm = Math.min(1, Math.max(0, gestureNorm + delta))
        change(Params.normToValue(def, gestureNorm))
    }
    Keys.onPressed: event => {
        var step = event.modifiers & Qt.ShiftModifier ? 0.005 : 0.02
        if (event.key === Qt.Key_Up || event.key === Qt.Key_Right) { nudge(step); event.accepted = true }
        else if (event.key === Qt.Key_Down || event.key === Qt.Key_Left) { nudge(-step); event.accepted = true }
    }
    Keys.onReleased: event => { gestureEnd() }
    Rectangle {
        anchors.centerIn: dial
        width: root.diameter + 4; height: width; radius: width / 2
        color: "transparent"; border.width: root.activeFocus ? Ui.Metrics.border : 0; border.color: root.accentColor
    }
    Canvas {
        id: dial
        objectName: "dial"
        width: root.diameter; height: width
        onPaint: {
            var ctx = getContext("2d")
            ctx.reset(); ctx.scale(width / 80, height / 80)
            ctx.beginPath(); ctx.arc(40, 40, 26, 0, 2 * Math.PI)
            ctx.fillStyle = root.dragging || mouse.containsMouse ? Ui.Theme.actionSelected : Ui.Theme.surfacePanel
            ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = Ui.Theme.borderSubtle; ctx.stroke()
            function arc(from, to, colour) {
                if (Math.abs(to - from) < .01) to = from + .01
                ctx.beginPath(); ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.strokeStyle = colour
                ctx.arc(40, 40, 33, (from - 90) * Math.PI / 180, (to - 90) * Math.PI / 180, to < from); ctx.stroke()
            }
            arc(-135, 135, Ui.Theme.borderSubtle); arc(root.arcStart, root.degrees, root.accentColor)
            ctx.save(); ctx.translate(40, 40); ctx.rotate(root.degrees * Math.PI / 180)
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -23)
            ctx.lineWidth = 4; ctx.strokeStyle = Ui.Theme.textPrimary; ctx.stroke(); ctx.restore()
        }
        Connections {
            target: Ui.Theme
            function onEffectiveSchemeChanged() { dial.requestPaint() }
        }
        Connections {
            target: root
            function onDegreesChanged() { dial.requestPaint() }
            function onArcStartChanged() { dial.requestPaint() }
            function onAccentColorChanged() { dial.requestPaint() }
            function onDraggingChanged() { dial.requestPaint() }
        }
    }
    Ui.Text {
        id: labelText
        anchors.top: dial.bottom; anchors.topMargin: Ui.Metrics.xs; anchors.horizontalCenter: parent.horizontalCenter
        visible: root.size !== "xs"
        text: root.label; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary
    }
    Ui.Text {
        id: valueLabel
        anchors.top: root.size === "xs" ? dial.bottom : labelText.bottom
        anchors.topMargin: Ui.Metrics.micro; anchors.horizontalCenter: parent.horizontalCenter
        height: implicitHeight; text: root.valueText; role: Ui.Typography.MonoCaption; tone: Ui.Text.Primary; opacity: mouse.containsMouse || root.dragging || root.activeFocus ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: Ui.Theme.reducedMotion ? 0 : Ui.Metrics.motionQuick } }
    }
    Timer { id: wheelEnd; interval: 250; onTriggered: root.gestureEnd() }
    MouseArea {
        id: mouse
        anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.SizeVerCursor
        onContainsMouseChanged: dial.requestPaint()
        onPressed: event => {
            if (event.button !== Qt.LeftButton) return
            root.forceActiveFocus(); root.dragging = true; root.lastY = event.y
        }
        onPositionChanged: event => {
            if (!root.dragging) return
            var dy = root.lastY - event.y; root.lastY = event.y
            root.nudge(dy * (event.modifiers & Qt.ShiftModifier ? 0.0008 : 0.005))
        }
        onReleased: { if (root.dragging) { root.dragging = false; root.gestureEnd() } }
        onCanceled: root.cancelGesture()
        onDoubleClicked: root.requestSet(root.def.def)

    }
    WheelHandler {
        target: null
        acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
        onWheel: event => {
            var delta = event.angleDelta.y || event.pixelDelta.y
            if (delta === 0) { event.accepted = true; return }
            root.nudge((delta > 0 ? 1 : -1) * (event.modifiers & Qt.ShiftModifier ? .005 : .03))
            event.accepted = true; wheelEnd.restart()
        }
    }
}
