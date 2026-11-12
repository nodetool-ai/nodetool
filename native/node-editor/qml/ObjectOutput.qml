import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
ColumnLayout {
    property var fields: []
    spacing: Ui.Metrics.md
    Repeater {
        model: fields
        ColumnLayout {
            required property var modelData
            Layout.fillWidth: true
            Ui.Text {
                visible: fields.length !== 1
                text: modelData.name.replace(/_/g, " ")
                role: Ui.Typography.SansLabel
                color: Ui.Theme.accentPrimary
            }
            Loader {
                Layout.fillWidth: true
                Component.onCompleted: setSource("RichOutput.qml", {modelData: parent.modelData.output})
            }
        }
    }
}
