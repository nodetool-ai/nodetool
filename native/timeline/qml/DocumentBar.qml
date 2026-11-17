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
    // The cloud servers and their accounts. Null hides the Account control,
    // which shows the current server's account.
    property AccountServers accountServers: null
    readonly property AccountController account: accountServers ? accountServers.current : null
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
        x: Ui.Metrics.lg
        anchors.verticalCenter: parent.verticalCenter
        spacing: Ui.Metrics.md
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
            spacing: Ui.Metrics.md
        }
    }
    Row {
        anchors.right: parent.right
        anchors.rightMargin: Ui.Metrics.md
        anchors.verticalCenter: parent.verticalCenter
        spacing: Ui.Metrics.md
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
        Loader {
            objectName: "documentAccount"
            anchors.verticalCenter: parent.verticalCenter
            active: bar.account !== null
            visible: active
            sourceComponent: AccountControl { account: bar.account; servers: bar.accountServers }
        }
    }
}
