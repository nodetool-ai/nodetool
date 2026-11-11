import QtQuick
import QtQuick.Controls.Basic as Basic
Basic.ProgressBar {
    id: root
    property string accessibleName: ""
    Accessible.name: accessibleName
    implicitWidth: Metrics.xxxl * 4
    implicitHeight: Metrics.sm
    background: Rectangle { color: Theme.actionSelected; radius: height / 2 }
    contentItem: Item {
        implicitWidth: Metrics.xxxl * 4; implicitHeight: Metrics.sm
        Rectangle { width: parent.width * Math.max(0, Math.min(1, root.visualPosition)); height: parent.height; radius: height / 2; color: Theme.accentPrimary }
    }
}
