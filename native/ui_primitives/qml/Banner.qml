import QtQuick
import NodeTool.UiPrimitives as Ui

// A message strip for a failed load or operation (status Error) or a notice. Actions are
// optional and only signal: `retryable` shows Retry, `reportable` shows Report, and
// `actionText` shows one caller-named button. The host decides what each signal does.
Rectangle {
    id: root
    property int status: Ui.Status.Info
    property string message: ""
    // Server and provider text is shown literally unless the caller sets Text.StyledText.
    property int textFormat: Text.PlainText
    property string actionText: ""
    property bool retryable: false
    property bool reportable: false
    signal actionTriggered()
    signal retryRequested()
    signal reportRequested()
    implicitWidth: statusView.implicitWidth + (actions.visible ? actions.implicitWidth + Metrics.md : 0) + Metrics.md * 2
    implicitHeight: row.implicitHeight + Metrics.md * 2
    radius: Metrics.radiusCard
    color: status === Ui.Status.Warning ? Theme.statusWarningSurface : status === Ui.Status.Error ? Theme.statusErrorSurface : Theme.surfacePanel
    border.width: Metrics.border
    border.color: Theme.borderSubtle
    Row {
        id: row
        anchors.fill: parent
        anchors.margins: Metrics.md
        spacing: Metrics.md
        Ui.Status { id: statusView; width: Math.max(0, row.width - (actions.visible ? actions.width + row.spacing : 0)); anchors.verticalCenter: parent.verticalCenter; status: root.status; message: root.message; textFormat: root.textFormat; wrap: true }
        Row {
            id: actions
            anchors.verticalCenter: parent.verticalCenter
            spacing: Metrics.sm
            visible: root.actionText !== "" || root.retryable || root.reportable
            Ui.EditorButton { objectName: "bannerRetryButton"; visible: root.retryable; text: qsTr("Retry"); onClicked: root.retryRequested() }
            Ui.EditorButton { objectName: "bannerReportButton"; visible: root.reportable; text: qsTr("Report"); accessibleName: qsTr("Report this error"); onClicked: root.reportRequested() }
            Ui.EditorButton { objectName: "bannerActionButton"; visible: root.actionText !== ""; text: root.actionText; onClicked: root.actionTriggered() }
        }
    }
}
