pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    required property FirstWorkflowGuide guide
    property real topInset: Ui.Metrics.xxl
    // The widest the guide may grow. The host sets this to the canvas width minus margins.
    property real maximumWidth: Ui.Metrics.dialogWidth + Ui.Metrics.xxxl
    readonly property real cardWidth: Math.min(content.implicitWidth + Ui.Metrics.xl * 2, root.maximumWidth)
    visible: root.guide.visible
    // The inset keeps the elevated surface's shadow inside the view.
    implicitWidth: root.cardWidth + Ui.Metrics.xs * 2
    implicitHeight: content.implicitHeight + Ui.Metrics.xl * 2 + Ui.Metrics.xs + Ui.Metrics.md
    Ui.Surface {
        x: Ui.Metrics.xs
        y: Ui.Metrics.xs
        width: root.cardWidth
        height: content.implicitHeight + Ui.Metrics.xl * 2
        elevated: true
        ColumnLayout {
            id: content
            anchors.fill: parent
            anchors.margins: Ui.Metrics.xl
            spacing: Ui.Metrics.lg
            RowLayout {
                Layout.fillWidth: true
                spacing: Ui.Metrics.lg
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.xs
                    Ui.Text {
                        text: "Build your first useful workflow"
                        role: Ui.Typography.SansTitle
                        Layout.fillWidth: true
                    }
                    Ui.Text {
                        text: "Connect a text input to an output, run it, and see the result. This starter needs no model or provider setup."
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        wrapMode: Text.Wrap
                        Layout.fillWidth: true
                    }
                }
                Ui.EditorButton {
                    objectName: "setup-guide-close"
                    Layout.alignment: Qt.AlignTop
                    visible: root.guide.started
                    iconName: "close"
                    accessibleName: "Close guide"
                    variant: Ui.EditorButton.Flat
                    onClicked: root.guide.run("close-guide")
                }
            }
            ColumnLayout {
                visible: root.guide.started
                spacing: Ui.Metrics.sm
                Repeater {
                    model: ["Input added", "Output added", "Input connected to output", "Workflow saved", "Workflow run completed"]
                    delegate: RowLayout {
                        required property string modelData
                        required property int index
                        property bool complete: root.guide.readiness[index]
                        objectName: "setup-readiness-" + index
                        spacing: Ui.Metrics.sm
                        Rectangle {
                            width: Ui.Metrics.iconLg
                            height: width
                            radius: Ui.Metrics.radiusPill
                            color: "transparent"
                            border.width: Ui.Metrics.border
                            border.color: parent.complete ? Ui.Theme.statusSuccess : Ui.Theme.textDisabled
                            Ui.Icon {
                                anchors.centerIn: parent
                                name: "check"
                                visible: parent.parent.complete
                                tone: Ui.Text.Success
                            }
                        }
                        Ui.Text {
                            text: parent.modelData
                            role: Ui.Typography.SansLabel
                        }
                    }
                }
            }
            Flow {
                visible: !root.guide.started
                Layout.fillWidth: true
                spacing: Ui.Metrics.md
                Ui.EditorButton {
                    objectName: "setup-starter"
                    text: "Add the two-node starter"
                    variant: Ui.EditorButton.Primary
                    onClicked: root.guide.run("starter")
                }
                Ui.EditorButton {
                    objectName: "setup-choose"
                    text: "Choose my own nodes"
                    onClicked: root.guide.run("choose")
                }
                Ui.EditorButton {
                    objectName: "setup-templates"
                    text: "Start from a template"
                    onClicked: root.guide.run("templates")
                }
            }
        }
    }
}
