pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    required property var rows
    property string identity: "attributes"
    Layout.minimumWidth: 0
    implicitHeight: content.implicitHeight
    ColumnLayout {
        id: content
        width: root.width
    spacing: Ui.Metrics.xs
    Ui.Text { text: qsTr("None recorded"); visible: root.rows.length === 0; tone: Ui.Text.Secondary }
    Repeater {
        model: root.rows.slice(0, 128)
        delegate: RowLayout {
            id: row
            required property var modelData
            required property int index
            Layout.fillWidth: true
            spacing: Ui.Metrics.xl
            Ui.Text {
                objectName: root.identity + "-key-" + row.index
                Layout.preferredWidth: root.width * 0.35
                Layout.alignment: Qt.AlignTop
                role: Ui.Typography.MonoCode
                tone: Ui.Text.Secondary
                textFormat: Text.PlainText
                wrapMode: Text.WrapAnywhere
                maximumLineCount: 6
                elide: Text.ElideRight
                text: row.modelData.key
            }
            Ui.ScrollArea {
                Layout.fillWidth: true
                Layout.preferredHeight: Math.min(valueField.implicitHeight, Ui.Metrics.comfortable * 5)
                Ui.TextArea {
                    id: valueField
                    objectName: root.identity + "-value-" + row.index
                    width: parent.width
                    readOnly: true
                    variant: Ui.TextArea.Plain
                    role: Ui.Typography.MonoCode
                    textFormat: TextEdit.PlainText
                    wrapMode: TextEdit.WrapAnywhere
                    accessibleName: row.modelData.key
                    value: row.modelData.value
                }
            }
        }
    }
    Ui.Text { Layout.fillWidth: true; wrapMode: Text.Wrap; visible: root.rows.length > 128; text: qsTr("Showing the first 128 attributes.") }
}
}
