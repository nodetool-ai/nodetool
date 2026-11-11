pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    objectName: "runtime-dialog"
    required property var controller
    color: Ui.Theme.surfaceOverlay
    border.color: Ui.Theme.borderControl
    border.width: Ui.Metrics.border
    radius: Ui.Metrics.radiusOverlay
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
            text: "Install missing runtimes on the machine running the NodeTool server. Local servers use the nodetool CLI. For remote servers, run the command on the server host."
            role: Ui.Typography.SansBody
            wrapMode: Text.Wrap
            Layout.fillWidth: true
        }
        Ui.Text {
            objectName: "setup-state"
            text: root.controller.state === "installing" ? "Installing…" : root.controller.state === "loading" ? "Checking dependencies…" : root.controller.state === "installed" ? "Completed. Node catalog refreshed." : root.controller.error
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
        Ui.TextArea {
            visible: root.controller.progress.length > 0 || root.controller.guidance.length > 0
            text: [root.controller.guidance, root.controller.progress].filter(function(line) { return line.length > 0 }).join("\n")
            readOnly: true
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.Metrics.touch * 3
        }
        Ui.EditorButton {
            objectName: "runtime-copy"
            visible: root.controller.guidance.length > 0
            text: "Copy command"
            onClicked: root.controller.copyGuidance()
        }
        ListView {
            visible: root.controller.state !== "templates"
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            model: root.controller.runtimes
            delegate: RowLayout {
                required property var modelData
                width: ListView.view.width
                ColumnLayout {
                    Layout.fillWidth: true
                    Ui.Text {
                        text: (modelData.name || modelData.id) + " · " + (modelData.status || (modelData.installed ? "installed" : "missing")) + " " + (modelData.version || "")
                        role: Ui.Typography.SansLabel
                        Layout.fillWidth: true
                        wrapMode: Text.Wrap
                    }
                    Ui.Text {
                        text: modelData.installCommand || ""
                        visible: text.length > 0
                        role: Ui.Typography.MonoCaption
                        Layout.fillWidth: true
                        wrapMode: Text.Wrap
                    }
                }
                Ui.EditorButton {
                    objectName: "runtime-install-" + modelData.id
                    text: root.controller.canInstall ? "Install" : "Show command"
                    enabled: !modelData.installed && root.controller.state !== "installing"
                    onClicked: root.controller.installRuntime(modelData.id)
                }
            }
        }
        Ui.EditorButton {
            objectName: "runtime-install-all"
            text: root.controller.canInstall ? "Install all" : "Show server command"
            enabled: root.controller.state !== "installing"
            onClicked: root.controller.installAll()
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
            visible: root.controller.state !== "templates" && root.controller.packs.length > 0
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
