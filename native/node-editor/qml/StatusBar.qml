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
    // One status bar tab. A view with no native panel stays visible and disabled, and its tooltip says why.
    component StatusTab: Item {
        id: tab
        property string glyph: ""
        property string label: ""
        property int count: 0
        property bool active: false
        property string unavailable: ""
        signal activated()
        Layout.fillHeight: true
        implicitWidth: content.implicitWidth + Ui.Metrics.lg * 2
        PanelRow {
            id: button
            anchors.fill: parent
            anchors.topMargin: Ui.Metrics.micro
            anchors.bottomMargin: Ui.Metrics.micro
            text: tab.label
            active: tab.active
            enabled: tab.unavailable === ""
            onClicked: tab.activated()
        }
        RowLayout {
            id: content
            anchors.centerIn: parent
            spacing: Ui.Metrics.sm
            Ui.Icon {
                name: tab.glyph
                size: Ui.Metrics.iconSm
                tone: tab.active ? Ui.Text.Primary : Ui.Text.Disabled
                domainColor: tab.active ? Ui.Theme.accentPrimary : undefined
            }
            Ui.Text {
                text: tab.label
                role: Ui.Typography.SansLabel
                font.weight: Font.Normal
                tone: button.enabled ? Ui.Text.Secondary : Ui.Text.Disabled
                lineHeight: 1
            }
            Ui.Text {
                objectName: tab.objectName + "-count"
                visible: tab.count > 0
                text: tab.count
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                lineHeight: 1
            }
        }
        HoverHandler {
            onHoveredChanged: {
                root.status.showToolTip(hovered ? tab.unavailable : "")
            }
        }
    }
    // A readout pair: a lowercase key and its value. The graph counts put the value first and the system readout puts the key first.
    component Readout: RowLayout {
        id: pair
        property string key: ""
        property string value: ""
        property bool keyFirst: false
        spacing: Ui.Metrics.sm
        layoutDirection: keyFirst ? Qt.LeftToRight : Qt.RightToLeft
        Ui.Text { objectName: pair.objectName + "-key"; text: pair.key; role: Ui.Typography.SansLabel; tone: Ui.Text.Disabled; font.weight: Font.Normal; lineHeight: 1 }
        Ui.Text { objectName: pair.objectName + "-value"; text: pair.value; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary; font.weight: Font.Normal; lineHeight: 1 }
    }
    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: Ui.Metrics.xl
        anchors.rightMargin: Ui.Metrics.lg
        spacing: 0
        RowLayout {
            Layout.rightMargin: Ui.Metrics.xl
            spacing: Ui.Metrics.md
            Rectangle { width: Ui.Metrics.sm; height: width; radius: width / 2; color: root.connected ? Ui.Theme.statusSuccess : Ui.Theme.textDisabled }
            Ui.Text {
                objectName: "status-connection"
                text: root.connection.charAt(0).toUpperCase() + root.connection.slice(1)
                role: Ui.Typography.SansLabel
                tone: Ui.Text.Secondary
                font.weight: Font.Normal
                lineHeight: 1
            }
            Ui.Text {
                objectName: "status-connection-detail"
                visible: text !== ""
                text: root.status.connectionDetail
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Disabled
                lineHeight: 1
            }
            // A server that was chosen retries by itself. The button retries now, like the web's retryNow.
            NodeButton {
                objectName: "status-reconnect"
                visible: !root.connected
                text: root.connection === "offline" ? "Reconnect" : "Connect"
                variant: NodeButton.Flat
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
        StatusTab {
            objectName: "status-logs"
            label: "Logs"
            glyph: "article"
            active: root.panels.outputVisible
            onActivated: root.panels.toggleStatusView("logs")
        }
        StatusTab {
            objectName: "status-queue"
            label: "Queue"
            glyph: "playlistPlay"
            count: root.status.queuedCount
            unavailable: root.status.queueAvailable ? "" : qsTr("The queue opens while jobs are queued or running.")
            onActivated: root.status.openQueue()
        }
        StatusTab {
            objectName: "status-generations"
            label: "Generations"
            glyph: "autoAwesomeOutlined"
            unavailable: qsTr("Generations across workflows have no native panel. Select a node and open History in the inspector.")
        }
        StatusTab {
            objectName: "status-workers"
            label: "Workers"
            glyph: "memory"
            unavailable: qsTr("Workers has no native panel yet.")
        }
        StatusTab {
            objectName: "status-versions"
            label: "Versions"
            glyph: "history"
            active: root.panels.versionsVisible
            onActivated: root.panels.toggleStatusView("versions")
        }
        StatusTab {
            objectName: "status-trace"
            label: "Trace"
            glyph: "timeline"
            active: root.panels.traceVisible
            onActivated: root.panels.toggleStatusView("trace")
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
            Ui.Text { text: "·"; role: Ui.Typography.SansLabel; tone: Ui.Text.Disabled; font.weight: Font.Normal; lineHeight: 1 }
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
