import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The web bottom panel: a tab header above the selected run's output.
Rectangle {
    EditorRoles { id: roles }
    color: roles.panel
    implicitHeight: Ui.Metrics.comfortable * 10
    implicitWidth: Ui.Metrics.dialogCompactWidth
    Rectangle { width: parent.width; height: Ui.Metrics.border; color: roles.divider }
    ColumnLayout {
        anchors.fill: parent
        anchors.topMargin: Ui.Metrics.border
        anchors.leftMargin: Ui.Metrics.lg
        anchors.rightMargin: Ui.Metrics.sm
        anchors.bottomMargin: Ui.Metrics.md
        spacing: Ui.Metrics.sm
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.Metrics.standard
            spacing: Ui.Metrics.md
            Ui.Text { text: "Output"; role: Ui.Typography.SansLabel; font.weight: Font.Normal; lineHeight: 1 }
            Item { Layout.fillWidth: true }
            NodeButton {
                objectName: "clear-run-history"
                text: "Clear history"
                variant: NodeButton.Flat
                enabled: runOutput && runOutput.runs.length > 0
                onClicked: runOutput.clear()
            }
            NodeButton {
                objectName: "close-output"
                text: ""
                accessibleName: "Close output"
                iconName: "close"
                variant: NodeButton.Flat
                implicitWidth: Ui.Metrics.compact
                onClicked: editor.action("Output")
            }
        }
        RowLayout {
            Layout.fillWidth: true
            Layout.rightMargin: Ui.Metrics.sm
            visible: runOutput && runOutput.runs.length > 0
            Ui.Select {
                objectName: "run-history"
                Layout.fillWidth: true
                accessibleName: "Run history"
                value: runOutput ? runOutput.selectedRunId : ""
                options: runOutput ? runOutput.runs.map(run => ({label: run.jobId + " · " + run.status, value: run.jobId})) : []
                enabled: options.length > 0
                density: Ui.EditorButton.Compact
                onValueCommitted: value => runOutput.selectRun(value)
            }
        }
        Ui.Text {
            visible: editor && editor.message.length > 0
            text: editor ? editor.message : ""
            role: Ui.Typography.SansCaption
            wrapMode: Text.WrapAnywhere
            Layout.fillWidth: true
        }
        Ui.EmptyState {
            visible: !runOutput || runOutput.runs.length === 0
            Layout.fillWidth: true
            Layout.fillHeight: true
            maxTextWidth: width
            title: "No run output"
            message: "Run this workflow to see outputs, node status, and logs."
        }
        Flickable {
            id: scroll
            objectName: "run-output-scroll"
            visible: runOutput && runOutput.runs.length > 0
            Layout.fillWidth: true
            Layout.fillHeight: true
            contentWidth: width
            contentHeight: entries.implicitHeight
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            ColumnLayout {
                id: entries
                width: scroll.width
                spacing: Ui.Metrics.md
                Repeater {
                    model: editor ? editor.outputMedia : []
                    MediaPreview {
                        required property var modelData
                        Layout.fillWidth: true
                        mediaKind: modelData.kind
                        locator: modelData.locator
                    }
                }
                Repeater {
                    model: runOutput ? runOutput.entries : []
                    ColumnLayout {
                        required property var modelData
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.xs
                        Ui.Text {
                            Layout.fillWidth: true
                            text: [modelData.nodeName || modelData.nodeId, modelData.outputName, modelData.kind, modelData.status, modelData.severity].filter(Boolean).join(" · ")
                            role: Ui.Typography.SansCaption
                            wrapMode: Text.WrapAnywhere
                        }
                        Ui.TextArea {
                            objectName: "run-output-text"
                            visible: !modelData.media || modelData.media.length === 0
                            Layout.fillWidth: true
                            variant: Ui.TextArea.Plain
                            role: Ui.Typography.MonoCode
                            accessibleName: "Run output"
                            readOnly: true
                            textFormat: TextEdit.PlainText
                            value: modelData.text || ""
                            wrapMode: TextEdit.WrapAnywhere
                        }
                        Ui.Separator { Layout.fillWidth: true }
                    }
                }
            }

        }
    }
}
