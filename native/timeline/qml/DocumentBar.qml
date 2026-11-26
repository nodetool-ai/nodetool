// Mirrors ui_primitives/DocumentBar.tsx as TimelineDocumentBar.tsx fills it:
// the document name and its save status, then Undo and Redo. 40 px high.
// The leading row holds the layout menu. The right side holds Export, the
// project settings, then the Account control when main gives an account.
// Panel toggles and the overflow menu have no native counterpart yet.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: bar
    objectName: "documentBar"
    required property TimelineModel timeline
    property QtObject autosave: null
    // An open cloud timeline. Its synchronization status replaces the save
    // status.
    property CloudDocument cloudDocument: null
    // The account the cloud timeline was opened with. With it, the owner
    // sees Share, which opens the share dialog.
    property AccountController cloudAccount: null
    readonly property bool canShare: cloudDocument !== null && cloudAccount !== null && cloudDocument.role === "owner"
    // The cloud servers and their accounts. Null leaves the File menu's
    // account entries off.
    property AccountServers accountServers: null
    readonly property AccountController account: accountServers ? accountServers.current : null
    // The folder of the open timeline's project. With an account and
    // a project folder on the bundled server, File > Publish to Cloud and
    // Synchronize open the review sheet.
    property ProjectFolderState projectFolder: null
    readonly property bool hasProjectBadge: projectFolder !== null && projectFolder.projectName !== ""
    readonly property bool canSwitchProject: projectFolder !== null && projectFolder.configured
    signal openTimelinesRequested()
    // Controls after Undo and Redo, such as the layout menu.
    default property alias leading: leadingRow.data

    height: TimelineMetrics.documentBarHeight
    color: Ui.Theme.surfaceCanvas
    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: Ui.Metrics.border
        color: Ui.Theme.borderSubtle
    }

    Row {
        x: Ui.Metrics.md
        anchors.verticalCenter: parent.verticalCenter
        spacing: Ui.Metrics.sm
        Ui.EditorButton {
            id: documentProjectButton
            objectName: "documentProjectButton"
            anchors.verticalCenter: parent.verticalCenter
            visible: bar.hasProjectBadge
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            iconName: "folderOutlined"
            iconColor: Ui.Theme.projectAccent
            trailingIconName: bar.canSwitchProject ? "arrowDropDown" : ""
            width: Math.min(implicitWidth, bar.width > 0 ? bar.width / 4 : implicitWidth)
            text: bar.projectFolder ? bar.projectFolder.projectName : ""
            accessibleName: bar.canSwitchProject
                ? qsTr("Project %1, open timelines").arg(text)
                : qsTr("Project %1").arg(text)
            description: bar.canSwitchProject
                ? qsTr("Open timelines in %1").arg(text)
                : (bar.projectFolder && bar.projectFolder.canReveal ? bar.projectFolder.revealLabel() : "")
            enabled: bar.canSwitchProject || (bar.projectFolder !== null && bar.projectFolder.canReveal)
            onClicked: {
                if (bar.canSwitchProject) bar.openTimelinesRequested()
                else if (bar.projectFolder && bar.projectFolder.canReveal) bar.projectFolder.reveal()
            }
        }
        ToolbarDivider {
            anchors.verticalCenter: parent.verticalCenter
            visible: documentProjectButton.visible
        }
        Ui.Text {
            objectName: "documentTitle"
            anchors.verticalCenter: parent.verticalCenter
            width: Math.min(implicitWidth, bar.width / 2)
            elide: Text.ElideRight
            text: bar.timeline.name
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Primary
        }
        SaveStatus {
            anchors.verticalCenter: parent.verticalCenter
            // Without an autosave it stays idle and hidden.
            autosave: bar.cloudDocument === null ? bar.autosave : null
            compact: bar.width < TimelineMetrics.compactDocumentBarWidth
        }
        Loader {
            objectName: "documentCloudStatus"
            anchors.verticalCenter: parent.verticalCenter
            active: bar.cloudDocument !== null
            visible: active
            sourceComponent: CloudSyncStatus { document: bar.cloudDocument }
        }
        // A viewer's cloud timeline, or one whose access was removed, takes
        // no edit (TimelineModel.readOnly).
        Ui.Status {
            objectName: "documentReadOnly"
            anchors.verticalCenter: parent.verticalCenter
            visible: bar.cloudDocument !== null && bar.cloudDocument.readOnly
            message: visible ? "Read-only: " + bar.cloudDocument.readOnlyReason : ""
            status: Ui.Status.Info
        }
        ToolbarDivider { anchors.verticalCenter: parent.verticalCenter }
        Row {
            anchors.verticalCenter: parent.verticalCenter
            spacing: Ui.Metrics.micro
            ToolButton {
                objectName: "undoButton"
                label: "Undo"
                iconOnly: true
                iconName: "undo"
                enabled: bar.timeline.undoStack.canUndo
                onClicked: bar.timeline.undoStack.undo()
            }
            ToolButton {
                objectName: "redoButton"
                label: "Redo"
                iconOnly: true
                iconName: "redo"
                enabled: bar.timeline.undoStack.canRedo
                onClicked: bar.timeline.undoStack.redo()
            }
        }
        Row {
            id: leadingRow
            anchors.verticalCenter: parent.verticalCenter
            spacing: Ui.Metrics.sm
        }
    }
    Row {
        anchors.right: parent.right
        anchors.rightMargin: Ui.Metrics.md
        anchors.verticalCenter: parent.verticalCenter
        spacing: Ui.Metrics.xs
        ToolButton {
            objectName: "shareButton"
            anchors.verticalCenter: parent.verticalCenter
            visible: bar.canShare
            label: "Share"
            iconName: "link"
            onClicked: shareDialog.active = true
        }
        SlotItems {
            anchors.verticalCenter: parent.verticalCenter
            slot: "documentBarActions"
            slotProperties: ({ timeline: bar.timeline })
        }
        SlotItems {
            anchors.verticalCenter: parent.verticalCenter
            slot: "documentBar"
            slotProperties: ({ timeline: bar.timeline })
        }
        // Made on first use, so a timeline nobody shares reads nothing.
        Loader {
            id: shareDialog
            objectName: "shareDialog"
            active: false
            sourceComponent: ShareDialog {
                account: bar.cloudAccount
                kind: "timeline"
                documentId: bar.cloudDocument ? bar.cloudDocument.documentId : ""
                documentName: bar.timeline.name
                Component.onCompleted: {
                    content = bar.cloudDocument.content()
                    open()
                }
                onClosed: shareDialog.active = false
            }
        }
        // Made on first use from the File menu (TransferMenu.cpp).
        Loader {
            id: transferDialog
            objectName: "transferDialog"
            readonly property bool available: bar.account !== null && bar.projectFolder !== null && bar.projectFolder.canTransfer
            function openSheet() {
                if (!available) return false
                active = true
                return true
            }
            active: false
            sourceComponent: TransferDialog {
                account: bar.account
                serverUrl: bar.projectFolder.serverUrl
                bundledServerUrl: bar.projectFolder.bundledServerUrl
                serverToken: bar.projectFolder.serverToken
                projectId: bar.projectFolder.projectId
                projectName: bar.projectFolder.projectName
                Component.onCompleted: open()
                onClosed: transferDialog.active = false
            }
        }
        // The File menu's account entries (AccountMenu.cpp) read and drive
        // this item. It shows nothing in the bar: it only holds the server
        // menu and the server dialog of the control.
        Item {
            id: accountMenuHost
            objectName: "documentAccount"
            readonly property bool available: bar.account !== null
            readonly property int state: bar.account ? bar.account.state : AccountController.SignedOut
            readonly property bool signedIn: state === AccountController.SignedIn
            readonly property bool signingIn: state === AccountController.SigningIn
            readonly property bool cloudAvailable: bar.account !== null && bar.account.cloudAvailable
            readonly property string displayName: bar.account ? bar.account.displayName : ""
            readonly property bool canSwitchServer: bar.accountServers !== null && bar.accountServers.servers.length > 1
            readonly property bool canShare: bar.canShare
            function signIn() { if (!available || signedIn || signingIn) return false; bar.account.signIn(); return true }
            function cancelSignIn() { if (!signingIn) return false; bar.account.cancelSignIn(); return true }
            function signOut() { if (!signedIn) return false; bar.account.signOut(); return true }
            function openServerDialog() { return accountControl.item ? accountControl.item.openServerDialog() : false }
            function openServerMenu() { return accountControl.item ? accountControl.item.openServerMenu() : false }
            function share() { if (!bar.canShare) return false; shareDialog.active = true; return true }
            anchors.verticalCenter: parent.verticalCenter
            width: 0
            height: parent.height
            Loader {
                id: accountControl
                active: bar.account !== null
                sourceComponent: AccountControl { account: bar.account; servers: bar.accountServers; showInline: false }
            }
        }
    }
}
