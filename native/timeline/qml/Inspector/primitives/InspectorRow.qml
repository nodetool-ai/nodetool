import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
Item {
    id: root
    property string label: ""
    default property alias content: controls.data
    implicitHeight: Math.max(Theme.controlXs, controls.implicitHeight)
    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: Theme.spacingXs
        anchors.rightMargin: Theme.spacingXs
        spacing: Theme.spacingSm
        Text {
            Layout.fillWidth: true
            text: root.label
            elide: Text.ElideRight
            color: Theme.textSecondary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
        }
        Item {
            Layout.minimumWidth: InspectorTokens.rowControlMinWidth
            implicitWidth: Math.max(InspectorTokens.rowControlMinWidth, controls.implicitWidth)
            implicitHeight: controls.implicitHeight
            Row {
                id: controls
                anchors.right: parent.right
                spacing: Theme.spacingXs
            }
        }
    }
}
