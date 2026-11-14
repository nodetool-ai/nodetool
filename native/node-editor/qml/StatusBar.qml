import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The web editor's bottom bar: connection, panel tabs, and the graph and system readout.
// Source: web/src/components/panels/PanelBottom.tsx (VIEW_SPECS, statusBarViews and the tab bar).
Rectangle {
    id: root
    required property StatusModel status
    required property PanelLayout panels
    EditorRoles { id: roles }
    color: roles.chrome
    implicitHeight: roles.statusHeight
    Rectangle { width: parent.width; height: Ui.Metrics.border; color: roles.divider }
    readonly property string connection: root.status.connectionStatus
    readonly property bool connected: connection === "connected"
    readonly property var stats: root.status.systemStats
    // The web hides the readout when the bar is narrower than this, so it never covers the last tab.
    // Source: STATUS_BAR_READOUT_MIN_WIDTH in PanelBottom.tsx.
    readonly property real readoutMinWidth: 900
    function memoryText() {
        if (stats.memory_used_gb !== undefined) {
            return stats.memory_used_gb.toFixed(1) + "G"
        }
        return Math.round(stats.memory_percent) + "%"
    }
    // A readout pair: a lowercase key and its value. The graph counts put the value first and the system readout puts the key first.
    component Readout: RowLayout {
        id: pair
        property string key: ""
        property string value: ""
        property bool keyFirst: false
        spacing: Ui.Metrics.sm
        layoutDirection: keyFirst ? Qt.LeftToRight : Qt.RightToLeft
        Ui.Text { objectName: pair.objectName + "-key"; text: pair.key; role: Ui.Typography.SansLabel; tone: Ui.Text.Disabled; weight: Font.Normal; tight: true }
        Ui.Text { objectName: pair.objectName + "-value"; text: pair.value; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary; weight: Font.Normal; tight: true }
    }
    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: Ui.Metrics.xl
        anchors.rightMargin: Ui.Metrics.lg
        spacing: 0
        RowLayout {
            Layout.rightMargin: Ui.Metrics.xl
            spacing: Ui.Metrics.md
            Rectangle { width: Ui.Metrics.sm; height: width; radius: Ui.Metrics.radiusPill; color: root.connected ? Ui.Theme.statusSuccess : Ui.Theme.textDisabled }
            Ui.Text {
                objectName: "status-connection"
                text: root.connection.charAt(0).toUpperCase() + root.connection.slice(1)
                role: Ui.Typography.SansLabel
                tone: Ui.Text.Secondary
                weight: Font.Normal
                tight: true
            }
            Ui.Text {
                objectName: "status-connection-detail"
                visible: text !== ""
                text: root.status.connectionDetail
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Disabled
                tight: true
            }
            // A server that was chosen retries by itself. The button retries now, like the web's retryNow.
            Ui.EditorButton {
                objectName: "status-reconnect"
                visible: !root.connected
                text: root.connection === "offline" ? "Reconnect" : "Connect"
                variant: Ui.EditorButton.Outlined; flat: true
                implicitHeight: Ui.Metrics.small
                onClicked: {
                    if (root.connection === "offline") {
                        root.status.reconnect()
                    } else {
                        root.status.connectServer()
                    }
                }
            }
        }
        // A view with no native panel stays visible and disabled, and its tooltip says why.
        Ui.TabBar {
            Layout.fillHeight: true
            appearance: Ui.TabBar.Filled
            accessibleName: "Panels"
            tabs: [
                { objectName: "status-logs", value: "logs", label: "Logs", iconName: "article", active: root.panels.outputVisible },
                { objectName: "status-queue", value: "queue", label: "Queue", iconName: "playlistPlay", active: root.panels.queueVisible, count: root.status.queuedCount },
                { objectName: "status-generations", value: "generations", label: "Generations", iconName: "autoAwesomeOutlined", active: root.panels.generationsVisible, count: root.status.generatingCount },
                { objectName: "status-workers", value: "workers", label: "Workers", iconName: "memory", active: false, disabledReason: qsTr("Workers has no native panel yet.") },
                { objectName: "status-versions", value: "versions", label: "Versions", iconName: "history", active: root.panels.versionsVisible },
                { objectName: "status-trace", value: "trace", label: "Trace", iconName: "timeline", active: root.panels.traceVisible }
            ]
            onValueCommitted: value => {
                if (value === "queue") {
                    root.status.openQueue()
                } else {
                    root.panels.toggleStatusView(value)
                }
            }
        }
        // The web bar carries no run message. Messages reach the inspector and the
        // tab bar notifications.
        Item { Layout.fillWidth: true }
        RowLayout {
            objectName: "status-readout"
            visible: root.width > root.readoutMinWidth
            spacing: Ui.Metrics.lg
            Readout {
                objectName: "status-nodes"
                value: root.status.nodeCount
                key: value === "1" ? "node" : "nodes"
            }
            Ui.Text { text: "·"; role: Ui.Typography.SansLabel; tone: Ui.Text.Disabled; weight: Font.Normal; tight: true }
            Readout {
                objectName: "status-edges"
                value: root.status.edgeCount
                key: value === "1" ? "edge" : "edges"
            }
            Readout {
                objectName: "status-cpu"
                keyFirst: true
                visible: root.stats.cpu_percent !== undefined
                key: "cpu"
                value: visible ? Math.round(root.stats.cpu_percent) + "%" : ""
            }
            Readout {
                objectName: "status-memory"
                keyFirst: true
                visible: root.stats.memory_percent !== undefined
                key: "mem"
                value: visible ? root.memoryText() : ""
            }
        }
    }
}
