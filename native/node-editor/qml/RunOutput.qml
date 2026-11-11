import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The body of the web Logs view (components/panels/TracePanel.tsx): the run picker,
// the empty state and compact rows. The status bar above it is the tab strip.
Rectangle {
    id: root
    EditorRoles { id: roles }
    color: roles.panel
    implicitHeight: Ui.Metrics.comfortable * 10
    implicitWidth: Ui.Metrics.dialogCompactWidth
    readonly property bool hasRuns: !!runOutput && runOutput.runs.length > 0
    // Run status labels of the web picker (i18n trace.runStatus).
    function statusLabel(status) {
        const labels = { completed: qsTr("Completed"), failed: qsTr("Failed"), cancelled: qsTr("Cancelled"), running: qsTr("Running") }
        return labels[status] || status
    }
    ColumnLayout {
        anchors.fill: parent
        anchors.leftMargin: Ui.Metrics.xl
        anchors.rightMargin: Ui.Metrics.xl
        anchors.topMargin: Ui.Metrics.md
        anchors.bottomMargin: Ui.Metrics.md
        spacing: Ui.Metrics.md
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.lg
            Ui.Select {
                id: runPicker
                objectName: "run-history"
                Layout.fillWidth: true
                // The web picker grows from 6 to 12 control heights.
                Layout.minimumWidth: Ui.Metrics.xxxl * 6
                Layout.maximumWidth: Ui.Metrics.xxxl * 12
                accessibleName: qsTr("Run")
                property string placeholderText: qsTr("No recent runs")
                displayText: options.length === 0 ? placeholderText : currentText
                value: runOutput ? runOutput.selectedRunId : ""
                options: runOutput ? runOutput.runs.map(run => ({label: run.jobId + " · " + root.statusLabel(run.status), value: run.jobId})) : []
                enabled: options.length > 0
                density: Ui.EditorButton.Compact
                onValueCommitted: value => runOutput.selectRun(value)
            }
            Ui.EditorButton {
                objectName: "askRunAgent"
                visible: root.hasRuns
                density: Ui.EditorButton.Compact
                text: qsTr("Ask agent")
                onClicked: editor.askRunAgent(runOutput.selectedRunId)
            }
            Item { Layout.fillWidth: true }
            NodeButton {
                objectName: "clear-run-history"
                visible: root.hasRuns
                text: "Clear history"
                variant: NodeButton.Flat
                onClicked: runOutput.clear()
            }
        }
        Ui.Text {
            visible: editor && editor.message.length > 0
            text: editor ? editor.message : ""
            role: Ui.Typography.SansCaption
            wrapMode: Text.WrapAnywhere
            Layout.fillWidth: true
        }
        Ui.EmptyState {
            visible: !root.hasRuns
            Layout.fillWidth: true
            Layout.fillHeight: true
            maxTextWidth: width
            title: qsTr("No recorded runs")
            message: qsTr("Start an app operation, workflow, or chat turn to inspect its trace and logs.")
        }
        Flickable {
            id: scroll
            objectName: "run-output-scroll"
            visible: runOutput && runOutput.runs.length > 0
            Layout.fillWidth: true
            Layout.fillHeight: true
            contentWidth: width
            contentHeight: entries.implicitHeight
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            ColumnLayout {
                id: entries
                width: scroll.width
                spacing: 0
                Repeater {
                    model: runOutput ? runOutput.collections : null
                    ColumnLayout {
                        id: collection
                        required property string collectionKey
                        required property var collectionItems
                        required property string collectionTitle
                        required property string collectionNotice
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.xs
                        Ui.Text { Layout.fillWidth: true; text: collectionTitle; role: Ui.Typography.SansCaption; wrapMode: Text.WrapAnywhere }
                        MediaGallery {
                            objectName: "output-gallery"
                            Layout.fillWidth: true
                            Layout.preferredHeight: preferredHeight
                            active: editor && editor.outputVisible && collection.y + collection.height >= scroll.contentY && collection.y <= scroll.contentY + scroll.height
                            items: collectionItems
                            scopeKey: "panel:" + collectionKey
                            notice: collectionNotice
                        }
                    }
                }
                // A row is one 32 px line, as web log rows are (TracePanel.tsx
                // SPAN_ROW_HEIGHT). Entries with content show it below the line.
                Repeater {
                    model: runOutput ? runOutput.richEntries : null
                    ColumnLayout {
                        id: row
                        objectName: "run-output-row"
                        required property var richEntry
                        property var modelData: richEntry
                        // A status line without text or media has nothing to render below it.
                        readonly property bool hasBody: !((modelData.kind === "status" || modelData.kind === "job")
                            && (modelData.text || "") === "" && (modelData.items || []).length === 0)
                        Layout.fillWidth: true
                        spacing: 0
                        Ui.Text {
                            Layout.fillWidth: true
                            Layout.preferredHeight: row.hasBody ? implicitHeight : Ui.Metrics.standard - Ui.Metrics.border
                            Layout.topMargin: row.hasBody ? Ui.Metrics.sm : 0
                            verticalAlignment: Text.AlignVCenter
                            text: [row.modelData.nodeName || row.modelData.nodeId, row.modelData.outputName, row.modelData.kind, row.modelData.status, row.modelData.severity].filter(Boolean).join(" · ")
                            role: Ui.Typography.SansCaption
                            elide: Text.ElideRight
                        }
                        RichOutput {
                            visible: row.hasBody
                            Layout.fillWidth: true
                            Layout.bottomMargin: Ui.Metrics.sm
                            modelData: row.modelData
                        }
                        Ui.Separator { Layout.fillWidth: true }
                    }
                }
            }

        }
    }
}
