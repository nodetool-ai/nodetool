// The compact ui_primitives Slider (Slider.tsx, density "compact"): a 4 px
// pill rail in action.selected, the primary fill, a 12 px primary thumb with a
// 2 px paper ring.
import QtQuick
import QtQuick.Controls.Basic
import NodeTool.Timeline

Slider {
    id: control
    implicitHeight: Theme.controlXs
    padding: 0
    focusPolicy: Qt.NoFocus

    background: Item {
        x: control.leftPadding
        width: control.availableWidth
        height: control.height
        Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width
            height: 4
            radius: 2
            color: Theme.actionSelected
            Rectangle {
                width: control.visualPosition * parent.width
                height: parent.height
                radius: 2
                color: Theme.primary
            }
        }
    }
    handle: Rectangle {
        x: control.leftPadding + control.visualPosition * (control.availableWidth - width)
        anchors.verticalCenter: parent.verticalCenter
        width: 12
        height: 12
        radius: 6
        color: Theme.primary
        border.width: 2
        border.color: Theme.backgroundPaper
        // The hover / active ring: 0 0 0 6px primary at 20%.
        Rectangle {
            visible: control.hovered || control.pressed
            anchors.centerIn: parent
            width: 24
            height: 24
            radius: 12
            z: -1
            color: Qt.rgba(Theme.primary.r, Theme.primary.g, Theme.primary.b, 0.2)
        }
    }
}
