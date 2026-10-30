// nt-panel: slot=bottom id=activity order=95 title="Activity"
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline

Rectangle {
    id: panel
    objectName: "activityPanel"
    color: Theme.backgroundDefault
    property var timeline: null
    property var controller: serverActivity
    property var localController: localActivity
    readonly property var allRows: localController.rows.concat(controller.rows)
    readonly property var filteredRows: allRows.filter(row => {
        const query = search.text.toLowerCase().trim()
        const matchesText = !query || [row.title, row.id, row.detail, row.kind, row.status, row.source].join(" ").toLowerCase().indexOf(query) >= 0
        const active = ["running", "scheduled", "queued", "pending", "submitted", "processing", "cancelling", "recovering", "needs_attention", "accepted", "submitting", "submission_unknown"].indexOf(row.status) >= 0
        return matchesText && (stateFilter.currentIndex === 0 || (stateFilter.currentIndex === 1 ? active : row.status === "failed" || row.status === "error" || ["interrupted", "unobserved", "needs_attention", "unavailable"].indexOf(row.status) >= 0))
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
        anchors.margins: Theme.spacingMd
        spacing: Theme.spacingMd
        Flow {
            Layout.fillWidth: true
            spacing: Theme.spacingMd
            Label { text: "Background activity"; color: Theme.textPrimary; font.pixelSize: Theme.fontSizeSmall; font.weight: Font.Medium }
            Button { objectName: "activityRefresh"; text: panel.controller.busy ? "Refreshing…" : "Refresh"; enabled: !panel.controller.busy; onClicked: panel.controller.refresh(); Accessible.name: "Refresh background activity" }
        }
        Label {
            Layout.fillWidth: true
            text: panel.controller.scopeLabel
            color: Theme.textSecondary
            font.pixelSize: Theme.fontSizeSmaller
            wrapMode: Text.Wrap
        }
        RowLayout {
            Layout.fillWidth: true
            spacing: Theme.spacingMd
            TextField { id: search; objectName: "activitySearch"; Layout.fillWidth: true; Layout.minimumWidth: 0; placeholderText: "Search activity"; Accessible.name: "Search activity"; selectByMouse: true }
            ComboBox { id: stateFilter; objectName: "activityFilter"; model: ["All", "Active", "Failures"]; Accessible.name: "Filter activity by state" }
        }
        Label {
            objectName: "activityError"
            Layout.fillWidth: true
            visible: !!text
            text: [panel.controller.error, panel.localController.error].filter(value => !!value).join("\n")
            color: Theme.warning
            wrapMode: Text.Wrap
            font.pixelSize: Theme.fontSizeSmall
            Accessible.role: Accessible.AlertMessage
        }
        Label {
            Layout.fillWidth: true
            visible: !!panel.controller.lastUpdated
            text: "Server checked: " + panel.controller.lastUpdated
            color: Theme.textSecondary
            wrapMode: Text.Wrap
            font.pixelSize: Theme.fontSizeSmaller
        }
        ListView {
            id: activityList
            objectName: "activityList"
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            spacing: Theme.spacingMd
            model: panel.filteredRows
            ScrollBar.vertical: ScrollBar {}
            delegate: Rectangle {
                id: card
                required property var modelData
                required property int index
                objectName: "activityRow_" + index
                width: activityList.width
                height: content.implicitHeight + Theme.spacingXl
                color: Theme.backgroundPaper
                radius: Theme.radiusSm
                border.color: Theme.divider
                ColumnLayout {
                    id: content
                    anchors { left: parent.left; right: parent.right; top: parent.top; margins: Theme.spacingMd }
                    spacing: Theme.spacingXs
                    Label { Layout.fillWidth: true; text: card.modelData.title; color: Theme.textPrimary; wrapMode: Text.Wrap; font.pixelSize: Theme.fontSizeSmall; font.weight: Font.Medium }
                    Label { Layout.fillWidth: true; text: card.modelData.source + (card.modelData.stale ? " (last known)" : "") + " · " + card.modelData.kind + " · " + card.modelData.status; color: card.modelData.status === "failed" ? Theme.error : Theme.textSecondary; wrapMode: Text.Wrap; font.pixelSize: Theme.fontSizeSmaller }
                    TextEdit { objectName: "activityId_" + card.index; Layout.fillWidth: true; text: card.modelData.id; color: Theme.textSecondary; readOnly: true; selectByMouse: true; wrapMode: TextEdit.WrapAnywhere; font.family: Theme.monoFamily; font.pixelSize: Theme.fontSizeSmaller; Accessible.name: "Activity ID " + text }
                    Label { Layout.fillWidth: true; visible: !!text; text: card.modelData.detail || ""; color: Theme.textSecondary; wrapMode: Text.Wrap; font.pixelSize: Theme.fontSizeSmaller }
                    ProgressBar { objectName: "activityProgress_" + card.index; Layout.fillWidth: true; visible: card.modelData.progress >= 0; value: Math.max(0, Math.min(1, card.modelData.progress)); Accessible.name: "Reported progress" }
                    Label { Layout.fillWidth: true; text: "Cost: " + card.modelData.cost; color: Theme.textSecondary; wrapMode: Text.Wrap; font.pixelSize: Theme.fontSizeSmaller }
                    Label { Layout.fillWidth: true; visible: !!text; text: card.modelData.updatedAt || ""; color: Theme.textSecondary; wrapMode: Text.Wrap; font.pixelSize: Theme.fontSizeSmaller }
                    Button {
                        objectName: "activityCancel_" + card.index
                        text: "Cancel"
                        visible: !!card.modelData.cancellable
                        enabled: card.modelData.source === "Local" || (!panel.controller.busy && panel.controller.connected)
                        Accessible.name: "Cancel " + card.modelData.title
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
                spacing: Theme.spacingMd
                Label {
                    objectName: "activityEmpty"
                    Layout.fillWidth: true
                    text: panel.controller.busy ? "Loading activity…" : panel.allRows.length ? "No activity matches this filter." : panel.controller.error ? "Activity could not be refreshed. Retry when the server is available." : "No background activity yet. Renders, proxies, and generations appear here."
                    color: Theme.textSecondary
                    wrapMode: Text.Wrap
                    horizontalAlignment: Text.AlignHCenter
                    font.pixelSize: Theme.fontSizeSmall
                }
                Button {
                    Layout.alignment: Qt.AlignHCenter
                    visible: !panel.controller.busy
                    text: panel.allRows.length ? "Clear filters" : "Refresh activity"
                    onClicked: {
                        if (panel.allRows.length) { search.clear(); stateFilter.currentIndex = 0 }
                        else panel.controller.refresh()
                    }
                }
            }
        }
        Button { objectName: "activityMore"; visible: panel.controller.hasMore; enabled: !panel.controller.busy; text: "Load older activity"; onClicked: panel.controller.loadMore() }
    }
}
