import QtQuick
import NodeTool.UiPrimitives as Ui

// SharePanel in a dialog, for an app whose window is QML. The app opens it
// from the document's Share button.
Ui.Dialog {
    id: root
    required property AccountController account
    required property string kind
    required property string documentId
    property string documentName: ""
    // The document JSON as the tab shows it (CloudDocument.content()).
    property string content: ""
    title: documentName === "" ? "Share" : "Share " + documentName
    width: Math.min(Ui.Metrics.dialogWidth, parent ? parent.width : Ui.Metrics.dialogWidth)
    height: parent ? Math.min(panel.implicitHeight + implicitHeaderHeight, parent.height - Ui.Metrics.xl * 2) : panel.implicitHeight
    modal: true
    onOpened: panel.reload()
    contentItem: SharePanel {
        id: panel
        account: root.account
        kind: root.kind
        documentId: root.documentId
        content: root.content
        color: "transparent"
        border.width: 0
        margin: 0
        onCloseRequested: root.close()
    }
}
