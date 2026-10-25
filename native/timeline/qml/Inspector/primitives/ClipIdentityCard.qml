import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
InspectorCard {
    id: root
    property string name: ""
    property var metadata: []
    property color accentColor: Theme.secondary
    Text {
        width: parent.width
        text: root.name
        wrapMode: Text.WrapAnywhere
        color: Theme.textPrimary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
        font.weight: Font.Medium
    }
    RowLayout {
        width: parent.width
        visible: root.metadata.length > 0
        spacing: Theme.spacingSm
        Rectangle { width: Theme.spacingMd; height: width; radius: width / 2; color: root.accentColor }
        Text {
            Layout.fillWidth: true
            text: root.metadata.join(" · ")
            wrapMode: Text.Wrap
            color: Theme.textSecondary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
        }
    }
}
