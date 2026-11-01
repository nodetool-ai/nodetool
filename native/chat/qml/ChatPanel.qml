pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    property var session: null
    readonly property bool narrow: width < ChatMetrics.narrow
    property var scrollPositions: ({})
    property bool threadPickerActive: false
    onNarrowChanged: if (!narrow) threadPickerActive = false
    objectName: "chatPanel"
    Ui.Surface { anchors.fill: parent; variant: Ui.Surface.Canvas }
    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.Metrics.none
        Ui.EditorButton {
            Layout.alignment: Qt.AlignRight
            Layout.margins: Ui.Metrics.md
            variant: Ui.EditorButton.Flat
            text: qsTr("Reconnect")
            visible: !!root.session && root.session.connectionStatus === "disconnected" && root.session.selectedThreadId.length > 0
            onClicked: root.session.resumeConnection()
        }
        Ui.Text {
            role: Ui.Typography.SansLabel
            Layout.fillWidth: true
            Layout.margins: Ui.Metrics.md
            visible: text.length > 0
            text: root.session ? root.session.error : ""
            tone: Ui.Text.Error
            wrapMode: Text.WordWrap
            Accessible.role: Accessible.AlertMessage
        }
        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: Ui.Metrics.none
            Loader {
                Layout.preferredWidth: ChatMetrics.sidebar
                Layout.fillHeight: true
                active: !root.narrow
                visible: active
                sourceComponent: ThreadList { session: root.session }
            }
            Ui.Separator {
                Layout.fillHeight: true
                visible: !root.narrow
                orientation: Qt.Vertical
            }
            Item {
                Layout.fillWidth: true
                Layout.fillHeight: true
                ConversationView {
                    anchors.fill: parent
                    visible: !root.narrow || !root.threadPickerActive
                    session: root.session
                    scrollPositions: root.scrollPositions
                    showBack: root.narrow
                    onBackRequested: root.threadPickerActive = true
                }
                Loader {
                    anchors.fill: parent
                    active: root.narrow && root.threadPickerActive
                    sourceComponent: ThreadList {
                        session: root.session
                        onThreadOpened: root.threadPickerActive = false
                    }
                }
            }
        }
    }
}
