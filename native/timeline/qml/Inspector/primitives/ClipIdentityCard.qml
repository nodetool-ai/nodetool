import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
InspectorCard {
    id: root
    property string name: ""
    property var metadata: []
    property color accentColor: Ui.Theme.accentPrimary
    Ui.Text {
        width: parent.width
        text: root.name
        wrapMode: Text.WrapAnywhere
        role: Ui.Typography.SansLabel
    }
    RowLayout {
        width: parent.width
        visible: root.metadata.length > 0
        spacing: Ui.Metrics.sm
        Rectangle { width: Ui.Metrics.md; height: width; radius: Ui.Metrics.radiusPill; color: root.accentColor }
        Ui.Text {
            Layout.fillWidth: true
            text: root.metadata.join(" · ")
            wrapMode: Text.Wrap
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
        }
    }
}
