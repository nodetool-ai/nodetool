pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    required property var controller
    color: Ui.Theme.surfacePanel
    implicitWidth: Ui.Metrics.dialogCompactWidth
    implicitHeight: Ui.Metrics.dialogWidth
    signal closeRequested
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.lg
        spacing: Ui.Metrics.md
        Ui.Text {
            text: "Runtimes and packs"
            role: Ui.Typography.SansTitle
            Layout.fillWidth: true
        }
        Ui.Text {
            text: "Install missing runtimes on the machine running the NodeTool server. Runtime installation is available in the Electron Package Manager."
            role: Ui.Typography.SansBody
            wrapMode: Text.Wrap
            Layout.fillWidth: true
        }
        Ui.Text {
            objectName: "setup-state"
            text: root.controller.state === "installing" ? "Enabling pack…" : root.controller.state === "loading" ? "Checking dependencies…" : root.controller.state === "installed" ? "Pack enabled. Node catalog refreshed." : root.controller.error
            role: Ui.Typography.SansBody
            wrapMode: Text.Wrap
            Layout.fillWidth: true
        }
        Ui.BusyIndicator {
            visible: root.controller.state === "installing" || root.controller.state === "loading"
            accessibleName: "Dependency operation progress"
        }
        Ui.Text {
            visible: root.controller.state === "templates" && root.controller.templates.length === 0
            text: "No workflow templates are available on this server. Choose your own nodes to begin."
            role: Ui.Typography.SansBody
            wrapMode: Text.Wrap
            Layout.fillWidth: true
        }
        ListView {
            visible: root.controller.state === "templates"
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            model: root.controller.templates
            delegate: Ui.EditorButton {
                required property var modelData
                required property int index
                text: modelData.name || "Workflow template"
                objectName: "setup-template-" + index
                onClicked: root.controller.chooseTemplate(index)
            }
        }
        ListView {
            visible: root.controller.state !== "templates"
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            model: root.controller.packs
            delegate: RowLayout {
                required property var modelData
                width: ListView.view.width
                Ui.Text {
                    text: modelData.name || modelData.id
                    role: Ui.Typography.SansLabel
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                }
                Ui.EditorButton {
                    objectName: "setup-enable-" + modelData.id
                    text: modelData.enabled ? "Enabled" : "Enable"
                    enabled: !modelData.enabled && root.controller.state !== "installing"
                    onClicked: root.controller.enable(modelData.id)
                }
            }
        }
        RowLayout {
            Ui.EditorButton {
                objectName: "setup-refresh"
                text: "Refresh"
                enabled: root.controller.state !== "installing"
                onClicked: root.controller.refresh()
            }
            Ui.EditorButton {
                objectName: "setup-retry"
                text: "Retry"
                visible: root.controller.state === "failed"
                onClicked: root.controller.retry()
            }
            Ui.EditorButton {
                objectName: "setup-cancel"
                text: "Cancel"
                visible: root.controller.state === "installing" || root.controller.state === "loading"
                onClicked: root.controller.cancel()
            }
            Ui.EditorButton {
                objectName: "setup-close"
                text: "Close"
                onClicked: {
                    root.controller.cancel();
                    root.closeRequested();
                }
            }
        }
    }
}
