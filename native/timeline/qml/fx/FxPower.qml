import QtQuick
import NodeTool.Timeline

// fxBase.css --ac -> Theme.primary, c_gray3 -> Theme.actionDisabled.
Rectangle {
    id: root
    property bool on: false
    property string label: ""
    signal toggle()
    implicitWidth: 15; implicitHeight: 15; radius: width / 2
    color: on ? Theme.primary : Theme.actionDisabled
    border.width: 1; border.color: on ? Qt.rgba(Theme.primary.r, Theme.primary.g, Theme.primary.b, .6) : Theme.divider
    activeFocusOnTab: true
    Accessible.role: Accessible.CheckBox
    Accessible.name: label + " power"
    Accessible.checkable: true; Accessible.checked: on
    Accessible.onPressAction: root.toggle()
    Keys.onSpacePressed: root.toggle()
    Keys.onReturnPressed: root.toggle()
    Rectangle {
        anchors.fill: parent; anchors.margins: -3
        radius: width / 2; color: "transparent"
        border.width: root.activeFocus ? 1 : 0; border.color: Theme.primary
        objectName: "focusRing"
    }
    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: { root.forceActiveFocus(); root.toggle() } }
}
