import QtQuick
import NodeTool.Timeline

Item {
    id: root
    property var def: ({options:[]})
    property real value: 0
    property string accent: "n"
    // QML reserves `set`. Keep React's onSet callback and expose setValue
    // for QML signal consumers (onSetValue).
    property var onSet: function(value) {}
    signal setValue(real value)
    function requestSet(value) { onSet(value); setValue(value) }
    readonly property var options: def.options ?? []
    readonly property int count: Math.max(1, options.length)
    readonly property int index: Math.min(count - 1, Math.max(0, Math.round(value)))
    readonly property color accentColor: accent === "a" ? Theme.info : accent === "b" ? Theme.warning : accent === "f" ? Theme.secondary : Theme.primary
    implicitWidth: row.width; implicitHeight: row.height
    function step(d) { requestSet((index + d + count) % count) }
    Row {
        id: row
        spacing: 4
        Rectangle {
            width: 18; height: 18; radius: 4; anchors.verticalCenter: parent.verticalCenter
            color: Theme.backgroundPaper; border.width: 1; border.color: prev.containsMouse || activeFocus ? root.accentColor : Theme.divider
            activeFocusOnTab: true; Accessible.role: Accessible.Button; Accessible.name: "Previous"
            Accessible.onPressAction: root.step(-1)
            Keys.onSpacePressed: root.step(-1)
            Keys.onReturnPressed: root.step(-1)
            Text { anchors.centerIn: parent; text: "◂"; font.pixelSize: 9; color: prev.containsMouse ? root.accentColor : Theme.textSecondary }
            MouseArea { id: prev; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: { parent.forceActiveFocus(); root.step(-1) } }
        }
        Rectangle {
            width: Math.max(52, valueLabel.implicitWidth + 14); height: valueLabel.implicitHeight + 8; radius: 4
            color: Theme.backgroundPaper; border.width: 1; border.color: Theme.divider
            Text { id: valueLabel; anchors.centerIn: parent; text: root.options[root.index] ?? String(root.index); font.family: Theme.monoFamily; font.pixelSize: 10; font.letterSpacing: 1; color: root.accentColor }
        }
        Rectangle {
            width: 18; height: 18; radius: 4; anchors.verticalCenter: parent.verticalCenter
            color: Theme.backgroundPaper; border.width: 1; border.color: next.containsMouse || activeFocus ? root.accentColor : Theme.divider
            activeFocusOnTab: true; Accessible.role: Accessible.Button; Accessible.name: "Next"
            Accessible.onPressAction: root.step(1)
            Keys.onSpacePressed: root.step(1)
            Keys.onReturnPressed: root.step(1)
            Text { anchors.centerIn: parent; text: "▸"; font.pixelSize: 9; color: next.containsMouse ? root.accentColor : Theme.textSecondary }
            MouseArea { id: next; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: { parent.forceActiveFocus(); root.step(1) } }
        }
    }
}
