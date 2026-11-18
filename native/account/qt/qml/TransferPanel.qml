pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The review sheet of Publish to Cloud and Synchronize (PRD "Link a local
// project" and "Synchronize a linked project"): what will be sent and what
// will be received per document, the documents changed on both sides with
// Receive or Keep local, deletions in their own section and off until each
// is confirmed, and what cannot be sent with the reason. An app shows it in
// a dialog and calls start() when it opens.
Rectangle {
    id: root
    required property AccountController account
    // The app's own server, which runs the transfer, and its token.
    required property url serverUrl
    // The server this launch of the app started. Transfers run only when
    // serverUrl is that server.
    required property url bundledServerUrl
    property string serverToken: ""
    required property string projectId
    property string projectName: ""
    // A linked project synchronizes. Otherwise the sheet publishes it.
    property bool linked: false
    // True: the sheet asks the server whether the project is linked when it
    // starts, and publishes or synchronizes from the answer.
    property bool readLink: false
    // The space inside the frame. A dialog that frames the panel sets 0.
    property real margin: Ui.Metrics.xl
    signal closeRequested()
    color: Ui.Theme.surfaceOverlay
    border.color: Ui.Theme.borderControl
    border.width: Ui.Metrics.border
    radius: Ui.Metrics.radiusOverlay
    implicitWidth: Ui.Metrics.dialogWidth
    implicitHeight: body.implicitHeight + margin * 2

    // The panel's own controller. A test passes one with its transport.
    property TransferController controller: TransferController {
        account: root.account
        serverUrl: root.serverUrl
        bundledServerUrl: root.bundledServerUrl
        serverToken: root.serverToken
        projectId: root.projectId
        projectName: root.projectName
        linked: root.linked
        readLink: root.readLink
    }
    readonly property int stage: root.controller.stage
    readonly property bool reviewing: stage === TransferController.Reviewing
    function start() { root.controller.start() }
    readonly property var sectionTitles: ({
        choice: "Changed here and in the cloud",
        receive: "Will be received",
        send: "Will be sent",
        deletion: "Deleted on this computer",
        problem: "Cannot be sent"
    })
    readonly property var sectionNotes: ({
        choice: "Pick which version to keep for each document.",
        deletion: "Each document comes back from the cloud unless you keep its deletion. Keeping it deletes the cloud document for everyone. It can be restored for 30 days."
    })

    ColumnLayout {
        id: body
        anchors.fill: parent
        anchors.margins: root.margin
        spacing: Ui.Metrics.lg

        Ui.Banner {
            objectName: "transfer-message"
            visible: root.controller.message !== "" && root.stage !== TransferController.CollectFirst
            status: root.reviewing ? Ui.Status.Warning : Ui.Status.Error
            message: root.controller.message
            retryable: root.stage === TransferController.Failed
            Layout.fillWidth: true
            onRetryRequested: root.controller.start()
        }
        Ui.Banner {
            objectName: "transfer-collect-first"
            visible: root.stage === TransferController.CollectFirst
            status: Ui.Status.Warning
            message: root.controller.message + "\n" + root.controller.external.join("\n")
            Layout.fillWidth: true
        }
        ColumnLayout {
            visible: root.stage === TransferController.Capturing || root.stage === TransferController.Running
            Layout.alignment: Qt.AlignHCenter
            spacing: Ui.Metrics.sm
            Ui.BusyIndicator { running: parent.visible; Layout.alignment: Qt.AlignHCenter }
            Ui.Text {
                text: root.stage === TransferController.Running
                      ? (root.controller.linked ? "Synchronizing. You can keep working." : "Publishing. You can keep working.")
                      : "Reading what changed."
                tone: Ui.Text.Secondary
                Layout.alignment: Qt.AlignHCenter
            }
        }
        Ui.EmptyState {
            objectName: "transfer-up-to-date"
            visible: root.reviewing && root.controller.rows.length === 0
            title: root.controller.linked ? "Up to date" : "Nothing to publish"
            message: root.controller.linked ? "Nothing changed here or in the cloud since the last synchronization."
                                 : "This project has no documents to send yet."
            Layout.fillWidth: true
        }
        Ui.EmptyState {
            objectName: "transfer-finished"
            visible: root.stage === TransferController.Finished
            title: root.controller.result.published ? "Published" : "Synchronized"
            message: {
                const result = root.controller.result
                const parts = []
                if (result.received && result.received.length > 0) parts.push("Received: " + result.received.join(", ") + ".")
                if (result.notReceived && result.notReceived.length > 0) parts.push("Not received: " + result.notReceived.join(", ") + ".")
                if (result.changedDuringReceive && result.changedDuringReceive.length > 0)
                    parts.push("Changed here while receiving, kept beside: " + result.changedDuringReceive.join(", ") + ".")
                if (result.sent) parts.push("Your changes are in the cloud.")
                return parts.join(" ")
            }
            Layout.fillWidth: true
        }

        // One list for every section, so a project with many documents
        // creates rows only as they scroll in.
        ListView {
            id: list
            objectName: "transfer-rows"
            visible: root.reviewing && count > 0
            clip: true
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.preferredHeight: Math.min(contentHeight, Ui.Metrics.dialogWidth)
            model: root.controller.rows
            spacing: Ui.Metrics.xs
            reuseItems: true
            boundsBehavior: Flickable.StopAtBounds
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            section.property: "section"
            section.delegate: ColumnLayout {
                id: heading
                required property string section
                width: ListView.view.width
                spacing: Ui.Metrics.xs
                Item { implicitHeight: Ui.Metrics.sm }
                Ui.PanelHeader { text: root.sectionTitles[heading.section] ?? heading.section; Layout.fillWidth: true }
                Ui.Text {
                    visible: text !== ""
                    text: root.sectionNotes[heading.section] ?? ""
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    wrapMode: Text.Wrap
                    Layout.fillWidth: true
                }
            }
            delegate: RowLayout {
                id: row
                required property var modelData
                objectName: "transfer-row-" + modelData.index
                width: ListView.view.width
                spacing: Ui.Metrics.sm
                ColumnLayout {
                    spacing: 0
                    Layout.fillWidth: true
                    Ui.Text { text: row.modelData.name; elide: Text.ElideRight; Layout.fillWidth: true }
                    Ui.Text {
                        text: row.modelData.text
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        wrapMode: Text.Wrap
                        Layout.fillWidth: true
                    }
                }
                Ui.SegmentedControl {
                    visible: row.modelData.section === "choice"
                    objectName: "transfer-choice-" + row.modelData.index
                    optionNamePrefix: "transfer-choice-" + row.modelData.index + "-"
                    accessibleName: "Version of " + row.modelData.name
                    options: row.modelData.canReceive
                             ? [{ label: "Receive", value: "receive" }, { label: "Keep local", value: "keepLocal" }]
                             : [{ label: "Keep local", value: "keepLocal" }]
                    value: row.modelData.choice
                    onValueCommitted: value => root.controller.choose(row.modelData.index, value)
                }
                Ui.CheckBox {
                    visible: row.modelData.canSendWithout
                    objectName: "transfer-missing-" + row.modelData.index
                    text: "Send without"
                    checked: row.modelData.confirmed
                    onToggled: root.controller.confirmMissingFile(row.modelData.index, checked)
                }
                Ui.CheckBox {
                    visible: row.modelData.section === "deletion"
                    objectName: "transfer-delete-" + row.modelData.index
                    text: "Keep deletion"
                    enabled: row.modelData.canKeepDeletion
                    checked: row.modelData.confirmed
                    onToggled: root.controller.confirmDeletion(row.modelData.index, checked)
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.sm
            Item { Layout.fillWidth: true }
            Ui.EditorButton {
                objectName: "transfer-close"
                text: root.reviewing || root.stage === TransferController.CollectFirst ? "Cancel" : "Close"
                enabled: root.stage !== TransferController.Running
                onClicked: {
                    root.controller.cancel()
                    root.closeRequested()
                }
            }
            Ui.EditorButton {
                objectName: "transfer-apply"
                visible: root.reviewing && root.controller.rows.length > 0
                text: root.controller.linked ? "Synchronize" : "Publish"
                variant: Ui.EditorButton.Primary
                enabled: root.controller.ready
                description: root.controller.ready ? "" : "Pick a version for each document changed on both sides, and confirm each missing file."
                onClicked: root.controller.apply()
            }
        }
    }
}
