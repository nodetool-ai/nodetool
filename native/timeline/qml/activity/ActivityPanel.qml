// nt-panel: slot=bottom id=activity order=95 title="Activity"
import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Surface {
    id: panel
    variant: Ui.Surface.Canvas
    objectName: "activityPanel"
    property string filterState: "All"
    property var timeline: null
    property var controller: serverActivity
    property var localController: localActivity
    readonly property var allRows: localController.rows.concat(controller.rows)
    readonly property var filteredRows: allRows.filter(row => {
        const query = search.text.toLowerCase().trim()
        const matchesText = !query || [row.title, row.id, row.detail, row.kind, row.status, row.source].join(" ").toLowerCase().indexOf(query) >= 0
        const active = ["running", "scheduled", "queued", "pending", "submitted", "processing", "cancelling", "recovering", "needs_attention", "accepted", "submitting", "submission_unknown"].indexOf(row.status) >= 0
        return matchesText && (panel.filterState === "All" || (panel.filterState === "Active" ? active : row.status === "failed" || row.status === "error" || ["interrupted", "unobserved", "needs_attention", "unavailable"].indexOf(row.status) >= 0))
    })
    ActivityController { id: serverActivity; timeline: panel.timeline }
    LocalActivity { id: localActivity; timeline: panel.timeline }
    function bindTimeline() {
        let ancestor = panel.parent
        while (ancestor) {
            if (ancestor.timeline !== undefined && ancestor.timeline) { panel.timeline = ancestor.timeline; return }
            ancestor = ancestor.parent
        }
    }
    Component.onCompleted: bindTimeline()
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.md
        Flow {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Ui.Text { objectName: "activityTitle"; role: Ui.Typography.SansLabel; text: "Background activity"; }
            Ui.EditorButton { objectName: "activityRefresh"; iconName: "refresh"; density: Ui.EditorButton.Compact; enabled: !panel.controller.busy; onClicked: panel.controller.refresh(); accessibleName: "Refresh background activity" }
        }
        Ui.Text { role: Ui.Typography.SansCaption;
            Layout.fillWidth: true
            text: panel.controller.scopeLabel
            tone: Ui.Text.Secondary
            wrapMode: Text.Wrap
        }
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Ui.TextField { id: search; objectName: "activitySearch"; Layout.fillWidth: true; Layout.minimumWidth: 0; placeholderText: "Search activity"; accessibleName: "Search activity"; selectByMouse: true }
            Ui.Select { id: stateFilter; objectName: "activityFilter"; options: [{label:"All",value:"All"},{label:"Active",value:"Active"},{label:"Failures",value:"Failures"}]; value: panel.filterState; accessibleName: "Filter activity by state"; onValueCommitted: next => panel.filterState = next }
        }
        Ui.Text { role: Ui.Typography.SansLabel;
            objectName: "activityError"
            Layout.fillWidth: true
            visible: !!text
            text: [panel.controller.error, panel.localController.error].filter(value => !!value).join("\n")
            tone: Ui.Text.Warning
            wrapMode: Text.Wrap
            Accessible.role: Accessible.AlertMessage
        }
        Ui.Text { role: Ui.Typography.SansCaption;
            Layout.fillWidth: true
            visible: !!panel.controller.lastUpdated
            text: "Server checked: " + panel.controller.lastUpdated
            tone: Ui.Text.Secondary
            wrapMode: Text.Wrap
        }
        ListView {
            id: activityList
            objectName: "activityList"
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            spacing: Ui.Metrics.md
            model: panel.filteredRows
            ScrollBar.vertical: Ui.ScrollBar {}
            delegate: Ui.Surface {
                id: card
                required property var modelData
                required property int index
                objectName: "activityRow_" + index
                width: activityList.width
                height: content.implicitHeight + Ui.Metrics.xl
                ColumnLayout {
                    id: content
                    anchors { left: parent.left; right: parent.right; top: parent.top; margins: Ui.Metrics.md }
                    spacing: Ui.Metrics.xs
                    Ui.Text { role: Ui.Typography.SansLabel; Layout.fillWidth: true; text: card.modelData.title; wrapMode: Text.Wrap;}
                    Ui.Text { role: Ui.Typography.SansCaption; Layout.fillWidth: true; text: card.modelData.source + (card.modelData.stale ? " (last known)" : "") + " · " + card.modelData.kind + " · " + card.modelData.status; tone: card.modelData.status === "failed" ? Ui.Text.Error : Ui.Text.Secondary; wrapMode: Text.Wrap;}
                    Ui.TextArea { objectName: "activityId_" + card.index; Layout.fillWidth: true; value: card.modelData.id; role: Ui.Typography.MonoCaption; variant: Ui.TextArea.Plain; readOnly: true; selectByMouse: true; wrapMode: TextEdit.WrapAnywhere; accessibleName: "Activity ID " + text }
                    Ui.Text { role: Ui.Typography.SansCaption; Layout.fillWidth: true; visible: !!text; text: card.modelData.detail || ""; tone: Ui.Text.Secondary; wrapMode: Text.Wrap;}
                    Ui.Progress { objectName: "activityProgress_" + card.index; Layout.fillWidth: true; visible: card.modelData.progress >= 0; value: Math.max(0, Math.min(1, card.modelData.progress)); accessibleName: "Reported progress" }
                    Ui.Text { role: Ui.Typography.SansCaption; Layout.fillWidth: true; text: "Cost: " + card.modelData.cost; tone: Ui.Text.Secondary; wrapMode: Text.Wrap;}
                    Ui.Text { role: Ui.Typography.SansCaption; Layout.fillWidth: true; visible: !!text; text: card.modelData.updatedAt || ""; tone: Ui.Text.Secondary; wrapMode: Text.Wrap;}
                    Ui.EditorButton {
                        objectName: "activityCancel_" + card.index
                        text: "Cancel"
                        visible: !!card.modelData.cancellable
                        enabled: card.modelData.source === "Local" || (!panel.controller.busy && panel.controller.connected)
                        accessibleName: "Cancel " + card.modelData.title
                        onClicked: {
                            if (card.modelData.source === "Local") { panel.localController.cancel(card.modelData.id) }
                            else { panel.controller.cancel(card.modelData.id, card.modelData.source) }
                        }
                    }
                }
            }
            ColumnLayout {
                anchors.centerIn: parent
                width: parent.width
                visible: activityList.count === 0
                spacing: Ui.Metrics.md
                Ui.Text { role: Ui.Typography.SansLabel;
                    objectName: "activityEmpty"
                    Layout.fillWidth: true
                    text: panel.controller.busy ? "Loading activity…" : panel.allRows.length ? "No activity matches this filter." : panel.controller.error ? "Activity could not be refreshed. Retry when the server is available." : "No background activity yet. Renders, proxies, and generations appear here."
                    tone: Ui.Text.Secondary
                    wrapMode: Text.Wrap
                    horizontalAlignment: Text.AlignHCenter
                }
                Ui.EditorButton {
                    Layout.alignment: Qt.AlignHCenter
                    // The header already has a refresh button, so only filtered rows need an action here.
                    visible: !panel.controller.busy && panel.allRows.length > 0
                    text: "Clear filters"
                    onClicked: { search.clear(); panel.filterState = "All" }
                }
            }
        }
        Ui.EditorButton { objectName: "activityMore"; visible: panel.controller.hasMore; enabled: !panel.controller.busy; text: "Load older activity"; onClicked: panel.controller.loadMore() }
    }
}
