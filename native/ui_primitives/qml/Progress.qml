import QtQuick
import QtQuick.Controls.Basic as Basic

Basic.ProgressBar {
    id: root
    property string accessibleName: ""
    Accessible.name: accessibleName
    implicitWidth: Metrics.xxxl * 4
    implicitHeight: Metrics.sm
    background: Rectangle {
        color: Theme.actionSelected
        radius: height / 2
    }
    contentItem: Item {
        implicitWidth: Metrics.xxxl * 4
        implicitHeight: Metrics.sm
        Rectangle {
            id: fill
            width: parent.width * (root.indeterminate ? 0.35 : Math.max(0, Math.min(1, root.visualPosition)))
            height: parent.height
            radius: height / 2
            color: Theme.accentPrimary
            x: root.indeterminate ? (parent.width - width) * travel : 0
            property real travel: 0.5
            SequentialAnimation on travel {
                running: root.indeterminate && root.visible && !Theme.reducedMotion
                loops: Animation.Infinite
                NumberAnimation {
                    to: 1
                    duration: Metrics.motionSpin
                }
                NumberAnimation {
                    to: 0
                    duration: Metrics.motionSpin
                }
            }
        }
    }
}
