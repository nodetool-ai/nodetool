pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    required property var workflowSession
    signal closeRequested()
    signal saveLocalAsRequested()
    property string lastError: ""
    readonly property bool bound: workflowSession && workflowSession.serverBound
    readonly property bool conflicted: workflowSession && workflowSession.conflictPending
    readonly property bool hasRemote: conflicted && workflowSession.conflictWorkflow.id !== undefined
    readonly property bool busy: workflowSession && (workflowSession.saving || workflowSession.remoteLoading)
    readonly property bool deleted: workflowSession && workflowSession.autosaveState === "deleted"
    readonly property string serverState: workflowSession ? workflowSession.autosaveState : ""
    color: Ui.Theme.surfaceOverlay
    border.color: Ui.Theme.borderControl
    border.width: Ui.Metrics.border
    radius: Ui.Metrics.radiusOverlay
    implicitWidth: Ui.Metrics.dialogWidth
    implicitHeight: content.implicitHeight + Ui.Metrics.xl * 2
    // Wording from conflictBannerLabel in web/src/hooks/useDocumentConflicts.ts.
    function mergeConflictText() {
        const conflicts = workflowSession ? workflowSession.mergeConflicts : []
        const lines = conflicts.map(conflict => conflict.reason === "replaced" ? "The whole document was replaced outside the editor"
            : conflict.reason === "deleted" ? conflict.label + (conflict.remoteDeleted ? " — deleted outside while you were editing it" : " — changed outside after you deleted it")
            : conflict.reason === "dangling" ? conflict.label + " — refers to something you deleted"
            : conflict.label + " — changed outside while you were editing it")
        return lines.length ? "Other server changes were merged. Your version was kept here:\n" + lines.join("\n") : ""
    }
    function preview(value) {
        const text = JSON.stringify(value || {}, null, 2)
        return text.length > 65536 ? text.slice(0, 65536) + "\n… Comparison preview shortened." : text
    }
    Connections {
        target: root.workflowSession
        function onErrorOccurred(message) { root.lastError = message }
        function onCredentialsChanged() { root.lastError = "" }
        function onWorkflowOpened() { root.lastError = "" }
        function onStateChanged() { if ((!root.bound && !root.conflicted) || root.serverState === "saved" || root.serverState === "reloaded") root.lastError = "" }
    }
    Basic.ScrollView {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.xl
        clip: true
        contentWidth: availableWidth
        ColumnLayout {
            id: content
            width: parent.width
            spacing: Ui.Metrics.md
            Ui.Text { text: "Server workflow"; role: Ui.Typography.SansTitle; Layout.fillWidth: true }
            Ui.Text {
                objectName: "server-sync-state"
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                role: Ui.Typography.SansBody
                text: !root.bound && !root.conflicted && root.serverState !== "error" ? "Local workflow. Server autosave is unavailable until you deliberately save to a server."
                    : root.deleted ? "The server workflow was deleted. Your local work is preserved."
                    : root.conflicted ? "The server workflow changed. Compare both versions before choosing which to keep."
                    : root.serverState === "saving" ? "Saving workflow to server…"
                    : root.serverState === "error" ? "Server save needs attention. Your local work is preserved."
                    : root.serverState === "unsaved" ? "Server workflow has unsaved changes."
                    : root.serverState === "reloaded" ? "Loaded the current server workflow."
                    : "Server workflow is saved."
            }
            Ui.Text {
                objectName: "server-sync-merge-conflicts"
                visible: root.conflicted && text.length > 0
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                role: Ui.Typography.SansBody
                text: root.conflicted ? root.mergeConflictText() : ""
            }
            Ui.CheckBox {
                objectName: "server-sync-autosave"
                text: "Autosave server changes"
                checked: root.workflowSession ? root.workflowSession.autosaveEnabled : false
                enabled: root.bound && !root.busy && !root.conflicted
                onCheckedChangedByUser: checked => root.workflowSession.autosaveEnabled = checked
            }
            Ui.Text { visible: root.lastError !== ""; text: root.lastError; objectName: "server-sync-error"; role: Ui.Typography.SansCaption; Layout.fillWidth: true; wrapMode: Text.WrapAnywhere }
            Ui.EditorButton {
                objectName: "server-sync-retry"
                text: "Retry server save"
                visible: !root.conflicted && root.serverState === "error"
                enabled: root.bound && !root.busy && root.workflowSession.autosaveEnabled
                onClicked: root.workflowSession.flushAutosave()
            }
            Ui.EditorButton {
                objectName: "server-sync-compare-refresh"
                text: "Refresh server comparison"
                visible: root.conflicted && !root.deleted
                enabled: !root.busy
                onClicked: root.workflowSession.refreshRemoteWorkflow()
            }
            GridLayout {
                visible: root.conflicted
                Layout.fillWidth: true
                columns: root.width >= Ui.Metrics.dialogWidth ? 2 : 1
                columnSpacing: Ui.Metrics.md
                rowSpacing: Ui.Metrics.md
                ColumnLayout {
                    Layout.fillWidth: true
                    Layout.preferredWidth: 1
                    Layout.minimumWidth: 0
                    Ui.Text { text: "Local draft"; role: Ui.Typography.SansLabel }
                    Basic.ScrollView {
                        id: localScroll
                        objectName: "server-sync-local-scroll"
                        Layout.fillWidth: true
                        Layout.preferredHeight: Ui.Metrics.comfortable * 5
                        clip: true
                        contentWidth: availableWidth
                        Ui.TextArea {
                            width: localScroll.availableWidth
                            objectName: "server-sync-local"
                            readOnly: true
                            selectByMouse: true
                            accessibleName: "Local workflow comparison"
                            role: Ui.Typography.MonoCaption
                            value: root.conflicted ? root.preview(root.workflowSession.workflow) : ""
                        }
                    }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    Layout.preferredWidth: 1
                    Layout.minimumWidth: 0
                    Ui.Text { text: "Server version"; role: Ui.Typography.SansLabel }
                    Basic.ScrollView {
                        id: remoteScroll
                        objectName: "server-sync-remote-scroll"
                        Layout.fillWidth: true
                        Layout.preferredHeight: Ui.Metrics.comfortable * 5
                        clip: true
                        contentWidth: availableWidth
                        Ui.TextArea {
                            width: remoteScroll.availableWidth
                            objectName: "server-sync-remote"
                            readOnly: true
                            selectByMouse: true
                            accessibleName: "Server workflow comparison"
                            role: Ui.Typography.MonoCaption
                            value: root.hasRemote ? root.preview(root.workflowSession.conflictWorkflow) : root.deleted ? "Deleted on the server." : "The server version is unavailable. Refresh the comparison."
                        }
                    }
                }
            }
            Flow {
                Layout.fillWidth: true
                spacing: Ui.Metrics.sm
                Ui.EditorButton { objectName: "server-sync-reload"; text: "Reload server version"; visible: root.conflicted; enabled: root.hasRemote && !root.busy; onClicked: root.workflowSession.reloadRemoteWorkflow() }
                Ui.EditorButton { objectName: "server-sync-keep-local"; text: "Keep local version"; visible: root.conflicted; enabled: root.hasRemote && !root.busy && !root.deleted; onClicked: root.workflowSession.keepLocalWorkflow() }
                Ui.EditorButton { objectName: "server-sync-save-local"; text: "Save local copy as…"; visible: root.conflicted || root.serverState === "error"; onClicked: root.saveLocalAsRequested() }
                Ui.EditorButton { objectName: "server-sync-later"; text: root.conflicted ? "Later" : "Close"; onClicked: root.closeRequested() }
            }
            Ui.Text { visible: root.conflicted; text: "Reload replaces the local draft. Keep local saves it against the compared server revision. Later leaves the conflict unresolved and pauses server writes."; role: Ui.Typography.SansCaption; wrapMode: Text.Wrap; Layout.fillWidth: true }
        }
    }
}
