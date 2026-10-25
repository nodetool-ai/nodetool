import QtQuick
import NodeTool.Timeline
Rectangle {
    default property alias content: body.data
    implicitHeight: body.implicitHeight + Theme.spacingMd * 2
    radius: Theme.radiusLg
    color: Theme.backgroundPaper
    border.color: Theme.divider
    border.width: 1
    Column {
        id: body
        x: Theme.spacingMd
        y: Theme.spacingMd
        width: parent.width - Theme.spacingMd * 2
        spacing: Theme.spacingXs
    }
}
