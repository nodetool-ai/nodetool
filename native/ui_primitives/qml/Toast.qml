import QtQuick
import NodeTool.UiPrimitives as Ui

// A short confirmation on the overlay surface. show(message) replaces any
// message on screen and hides it after `duration` milliseconds. The host
// places it; it takes no pointer input and announces itself to assistive
// technology as an alert.
Ui.Surface {
    id: root
    property string message: ""
    property int duration: 2600
    property bool shown: false
    function show(text) {
        message = text
        shown = true
        hideTimer.restart()
    }
    function hide() {
        hideTimer.stop()
        shown = false
    }
    variant: Ui.Surface.Overlay
    elevated: true
    border.width: Metrics.border
    border.color: Theme.borderControl
    radius: Metrics.radiusControl
    visible: shown || opacity > 0
    opacity: shown ? 1 : 0
    Behavior on opacity { enabled: !Theme.reducedMotion; NumberAnimation { duration: Metrics.motionQuick } }
    implicitWidth: label.implicitWidth + 2 * Metrics.lg
    implicitHeight: label.implicitHeight + 2 * Metrics.md
    Accessible.role: Accessible.AlertMessage
    Accessible.name: message
    Ui.Text {
        id: label
        objectName: "toastText"
        x: Metrics.lg
        y: Metrics.md
        width: Math.max(0, root.width - 2 * Metrics.lg)
        text: root.message
        role: Typography.SansLabel
        wrapMode: Text.WordWrap
    }
    Timer {
        id: hideTimer
        interval: root.duration
        onTriggered: root.shown = false
    }
}
