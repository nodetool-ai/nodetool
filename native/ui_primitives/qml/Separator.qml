import QtQuick

Rectangle {
    property int orientation: Qt.Horizontal
    implicitWidth: orientation === Qt.Vertical ? Metrics.border : Metrics.md
    implicitHeight: orientation === Qt.Horizontal ? Metrics.border : Metrics.md
    color: Theme.borderSubtle
    Accessible.ignored: true
}
