pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    required property var controller
    readonly property bool hasDetails: controller.view === "trace" ? !!controller.focusedSpanId : !!controller.selectedLog.id
    signal closeRequested()
    signal askAgentRequested(string runId, string spanId)
    color: Ui.Theme.surfacePanel
    implicitWidth: Ui.Metrics.dialogWidth
    implicitHeight: Ui.Metrics.comfortable * 14
    function plain(value) { return String(value || "").slice(0, 32000) }
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.sm
        RowLayout {
            Layout.fillWidth: true
            Ui.Text { text: qsTr("Run inspection"); role: Ui.Typography.SansLabel }
            Item { Layout.fillWidth: true }
            Ui.EditorButton { objectName: "trace-refresh"; text: qsTr("Refresh"); enabled: !root.controller.runsLoading; onClicked: root.controller.refresh() }
            Ui.EditorButton { objectName: "trace-close"; text: qsTr("Close"); onClicked: root.closeRequested() }
        }
        RowLayout {
            Layout.fillWidth: true
            Ui.Select {
                objectName: "trace-run"
                Layout.fillWidth: true
                accessibleName: qsTr("Stored run")
                value: root.controller.selectedRunId
                options: root.controller.runs.map(run => ({label: run.label, value: run.id}))
                onValueCommitted: value => root.controller.selectRun(value)
            }
            Ui.EditorButton { text: qsTr("More runs"); visible: root.controller.hasMoreRuns; enabled: !root.controller.runsLoading; onClicked: root.controller.loadMoreRuns() }
            Ui.EditorButton { objectName: "trace-view"; text: qsTr("Trace"); onClicked: root.controller.view = "trace" }
            Ui.EditorButton { objectName: "trace-logs"; text: qsTr("Logs"); onClicked: root.controller.view = "logs" }
        }
        Ui.Text {
            objectName: "trace-state"
            Layout.fillWidth: true
            textFormat: Text.PlainText
            wrapMode: Text.Wrap
            text: root.controller.error || (!root.controller.configured ? qsTr("Connect to a server to inspect stored runs.") : root.controller.runsLoading ? qsTr("Loading runs…") : !root.controller.selectedRunId ? qsTr("No stored runs for this workflow.") : root.plain(root.controller.summary.statusLabel) + " · " + root.plain(root.controller.summary.line))
        }
        Ui.Text {
            Layout.fillWidth: true
            visible: root.controller.summary.failureVisible === true
            textFormat: Text.PlainText; wrapMode: Text.Wrap
            tone: Ui.Text.Error
            text: root.plain(root.controller.summary.failureTitle) + "\n" + root.plain(root.controller.summary.failureMessage)
        }
        RowLayout {
            Layout.fillWidth: true
            Ui.EditorButton { objectName: "trace-failure"; text: qsTr("Show failing span"); visible: !!root.controller.summary.failedSpanId; onClicked: root.controller.showFailingSpan() }
            Ui.EditorButton { objectName: "trace-ask-run"; text: qsTr("Ask agent"); visible: !!root.controller.selectedRunId; onClicked: root.askAgentRequested(root.controller.selectedRunId, "") }
        }
        RowLayout {
            Layout.fillWidth: true
            visible: root.controller.view === "trace" && !!root.controller.selectedRunId
            Ui.CheckBox { objectName: "trace-errors"; text: qsTr("Errors only"); checked: root.controller.errorsOnly; onCheckedChangedByUser: checked => root.controller.errorsOnly = checked }
            Ui.TextField { objectName: "trace-name"; Layout.fillWidth: true; accessibleName: qsTr("Filter span name"); placeholderText: qsTr("Span name"); value: root.controller.nameFilter; onValueCommitted: value => root.controller.nameFilter = value }
            Ui.Select { accessibleName: qsTr("Trace depth"); value: root.controller.depth; options: [{label: "4", value: 4}, {label: "16", value: 16}, {label: "64", value: 64}]; onValueCommitted: value => root.controller.depth = value }
            Ui.EditorButton { text: qsTr("Clear filters"); enabled: root.controller.filtered; onClicked: root.controller.clearFilters() }
        }
        GridLayout {
            Layout.fillWidth: true
            visible: root.controller.view === "logs" && !!root.controller.selectedRunId
            columns: width >= Ui.Metrics.dialogWidth ? 3 : 1
            columnSpacing: Ui.Metrics.sm
            rowSpacing: Ui.Metrics.sm
            Ui.Select { objectName: "trace-level"; Layout.fillWidth: true; Layout.minimumWidth: 0; accessibleName: qsTr("Log level"); value: root.controller.logLevel; options: [{label: qsTr("All levels"), value: ""}, {label: "Debug", value: "debug"}, {label: "Info", value: "info"}, {label: "Warning", value: "warn"}, {label: "Error", value: "error"}]; onValueCommitted: value => root.controller.logLevel = value }
            Ui.Select { objectName: "trace-source"; Layout.fillWidth: true; Layout.minimumWidth: 0; accessibleName: qsTr("Log source"); value: root.controller.logSource; options: [{label: qsTr("All sources"), value: ""}].concat(root.controller.logSources.map(source => ({label: source, value: source}))); onValueCommitted: value => root.controller.logSource = value }
            TraceSpanPicker { Layout.fillWidth: true; Layout.minimumWidth: 0; controller: root.controller }
        }
        Ui.Text { Layout.fillWidth: true; textFormat: Text.PlainText; wrapMode: Text.Wrap; text: (root.controller.view === "logs" ? root.controller.logNotices : root.controller.notices).join("\n"); visible: text.length > 0 }
        Ui.Text { text: root.controller.view === "logs" ? qsTr("Loading logs…") : qsTr("Loading trace…"); visible: root.controller.view === "logs" ? root.controller.logsLoading : root.controller.traceLoading }
        GridLayout {
            id: inspection
            Layout.fillWidth: true
            Layout.fillHeight: true
            columns: width >= Ui.Metrics.dialogWidth * 1.5 && root.hasDetails ? 2 : 1
            rowSpacing: Ui.Metrics.md
            columnSpacing: Ui.Metrics.xl
        Basic.ScrollView {
            id: viewport
            objectName: root.controller.view === "trace" ? "trace-list-scroll" : "trace-span-list-scroll"
            visible: root.controller.view === "trace"
            Layout.fillWidth: true
            readonly property bool stackedDetails: inspection.columns === 1 && root.hasDetails
            Layout.minimumHeight: stackedDetails ? Ui.Metrics.compact + Ui.Metrics.standard + Ui.Metrics.xs + Ui.Metrics.md : 0
            Layout.fillHeight: !stackedDetails
            Layout.preferredWidth: inspection.width * 0.55
            Layout.preferredHeight: stackedDetails ? Math.min(inspection.height * 0.45,
                root.controller.view === "logs" ? Math.min(root.controller.logs.length, 3) * Ui.Metrics.standard + Ui.Metrics.md :
                (root.controller.serverSpans.length ? Ui.Metrics.compact + Math.min(root.controller.serverSpans.length, 3) * Ui.Metrics.standard + Ui.Metrics.xs : 0)
                + (root.controller.browserSpans.length ? Ui.Metrics.compact + Math.min(root.controller.browserSpans.length, 3) * Ui.Metrics.standard + Ui.Metrics.xs : 0)
                + Ui.Metrics.md) : inspection.height / 2
            clip: true
            contentWidth: availableWidth
            ColumnLayout {
                width: viewport.availableWidth
                spacing: Ui.Metrics.sm
                Ui.Text {
                    objectName: "trace-empty"
                    Layout.fillWidth: true
                    text: root.controller.view === "logs" ? qsTr("No logs match these filters.") : qsTr("No spans match these filters.")
                    visible: !!root.controller.selectedRunId && !root.controller.traceLoading && !root.controller.logsLoading && (root.controller.view === "logs" ? root.controller.logs.length === 0 : root.controller.serverSpans.length + root.controller.browserSpans.length === 0)
                }
                TraceSpanLane {
                    objectName: "trace-browser-lane"
                    Layout.fillWidth: true
                    visible: root.controller.view === "trace" && rows.length > 0
                    label: qsTr("Browser spans")
                    rows: root.controller.browserSpans
                    focusedSpanId: root.controller.focusedSpanId
                    viewportHeight: viewport.availableHeight / (root.controller.serverSpans.length ? 2 : 1)
                    onSpanFocused: spanId => root.controller.focusSpan(spanId)
                }
                TraceSpanLane {
                    objectName: "trace-server-lane"
                    Layout.fillWidth: true
                    visible: root.controller.view === "trace" && rows.length > 0
                    label: qsTr("Server spans")
                    rows: root.controller.serverSpans
                    focusedSpanId: root.controller.focusedSpanId
                    viewportHeight: viewport.availableHeight / (root.controller.browserSpans.length ? 2 : 1)
                    onSpanFocused: spanId => root.controller.focusSpan(spanId)
                }

            }
        }
        ColumnLayout {
            id: logViewport
            objectName: root.controller.view === "logs" ? "trace-list-scroll" : "trace-log-list-container"
            visible: root.controller.view === "logs"
            Layout.fillWidth: true
            Layout.minimumWidth: 0
            readonly property bool stackedDetails: inspection.columns === 1 && root.hasDetails
            Layout.minimumHeight: stackedDetails ? Ui.Metrics.compact + Ui.Metrics.standard + Ui.Metrics.xs + Ui.Metrics.md : 0
            Layout.fillHeight: !stackedDetails
            Layout.preferredWidth: inspection.width * 0.55
            Layout.preferredHeight: stackedDetails ? Math.min(inspection.height * 0.45, Ui.Metrics.compact + Math.min(root.controller.logs.length, 3) * Ui.Metrics.standard + Ui.Metrics.md) : inspection.height / 2
            spacing: Ui.Metrics.sm
            Ui.Text {
                Layout.fillWidth: true
                visible: !!root.controller.selectedRunId && !root.controller.logsLoading && root.controller.logs.length === 0
                text: qsTr("No logs match these filters.")
                textFormat: Text.PlainText
                wrapMode: Text.Wrap
            }
            TraceLogList {
                objectName: "trace-log-list"
                Layout.fillWidth: true
                Layout.fillHeight: true
                rows: root.controller.logs
                selectedLogId: root.controller.selectedLogId
                onLogSelected: logId => root.controller.selectLog(logId)
                onSpanFocused: spanId => root.controller.focusSpan(spanId)
            }
            Ui.EditorButton { objectName: "trace-more-logs"; text: qsTr("More logs"); visible: root.controller.hasMoreLogs; enabled: !root.controller.logsLoading; onClicked: root.controller.loadMoreLogs() }
        }
        TraceSpanDetails {
            id: details
            objectName: "trace-span-details"
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.preferredWidth: inspection.width * 0.45
            Layout.preferredHeight: inspection.height / 2
            visible: root.controller.view === "trace" && !!root.controller.focusedSpanId
            controller: root.controller
            onAskAgentRequested: (runId, spanId) => root.askAgentRequested(runId, spanId)
        }
        TraceLogDetails {
            id: logDetails
            objectName: "trace-log-details"
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.preferredWidth: inspection.width * 0.45
            Layout.preferredHeight: inspection.height / 2
            visible: root.controller.view === "logs" && !!root.controller.selectedLog.id
            controller: root.controller
            onAskAgentRequested: (runId, spanId) => root.askAgentRequested(runId, spanId)
        }
        }
    }
}
