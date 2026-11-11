// nt-panel: slot=documentBar id=takeStatus order=30 title="Takes"
// Says when a recording pass is armed and why a take switch was refused, in
// reach of every layout, because a number key works with any panel in front.
import QtQuick
import QtQuick.Window
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Row {
    id: root
    objectName: "takeStatus"
    property var timeline: null
    readonly property TakeSwitcher switcher: timeline ? TakeInfo.switcherFor(timeline) : null
    readonly property real messageShare: 0.3
    spacing: Ui.Metrics.md

    Row {
        objectName: "takeRecordingStatus"
        visible: root.switcher !== null && root.switcher.recording
        anchors.verticalCenter: parent.verticalCenter
        spacing: Ui.Metrics.xs
        Accessible.role: Accessible.StaticText
        Accessible.name: "Recording take switches"
        Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            width: Ui.Metrics.iconXs
            height: width
            radius: Ui.Metrics.radiusPill
            color: Ui.Theme.statusError
        }
        Ui.Text {
            anchors.verticalCenter: parent.verticalCenter
            text: "Recording takes"
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Primary
        }
    }
    Ui.Status {
        objectName: "takeMessage"
        visible: message !== ""
        // The bar is shared, so a long message elides in a small window.
        width: Math.min(implicitWidth, root.Window.width * root.messageShare)
        anchors.verticalCenter: parent.verticalCenter
        status: Ui.Status.Warning
        message: root.switcher !== null ? root.switcher.message : ""
    }
}
