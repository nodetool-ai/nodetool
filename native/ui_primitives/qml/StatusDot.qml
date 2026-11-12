import QtQuick

Rectangle {
    property bool active: true
    implicitWidth: Metrics.md
    implicitHeight: Metrics.md
    radius: Metrics.radiusPill
    color: active ? Theme.accentPrimary : Theme.textSecondary
}
