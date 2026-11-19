import QtQuick
import NodeTool.UiPrimitives as Ui

// TransferPanel in a dialog, for an app whose window is QML. The app opens it
// from File > Publish to Cloud and File > Synchronize. The sheet asks the
// server whether the project is linked and publishes or synchronizes from
// the answer.
Ui.Dialog {
    id: root
    required property AccountController account
    required property url serverUrl
    required property url bundledServerUrl
    property string serverToken: ""
    required property string projectId
    property string projectName: ""
    title: projectName === "" ? "Publish or synchronize" : "Publish or synchronize " + projectName
    width: Math.min(Ui.Metrics.dialogWidth, parent ? parent.width : Ui.Metrics.dialogWidth)
    height: parent ? Math.min(panel.implicitHeight + implicitHeaderHeight, parent.height - Ui.Metrics.xl * 2) : panel.implicitHeight
    modal: true
    onOpened: panel.start()
    contentItem: TransferPanel {
        id: panel
        account: root.account
        serverUrl: root.serverUrl
        bundledServerUrl: root.bundledServerUrl
        serverToken: root.serverToken
        projectId: root.projectId
        projectName: root.projectName
        readLink: true
        color: "transparent"
        border.width: 0
        margin: 0
        onCloseRequested: root.close()
    }
}
