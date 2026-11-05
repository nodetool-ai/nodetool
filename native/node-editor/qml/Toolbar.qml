import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// Canvas actions and the embedded conversation entry point.
Item {
    id: root
    // A narrow canvas keeps the run icon and drops its label, as the web does.
    property bool compact: false
    EditorRoles { id: roles }
    function syncTheme() {
        if (!editor) return
        editor.presentation({subgraphAccent: roles.subgraphAccent, canvas: roles.canvas, grid: roles.grid, node: roles.node, reroutePaper: roles.reroutePaper, rerouteBorder: roles.rerouteBorder, panel: roles.panel, overlay: roles.overlay, divider: roles.divider, field: roles.field, checker: roles.checker, shadow: roles.shadow, primary: Ui.Theme.accentPrimary, text: Ui.Theme.textPrimary, secondary: Ui.Theme.textSecondary, border: roles.divider, focus: Ui.Theme.borderFocus, error: Ui.Theme.statusError, warning: Ui.Theme.statusWarning, sans: Ui.Typography.sansFamily, captionSize: Ui.Typography.pixelSize(Ui.Typography.SansCaption), reducedMotion: Ui.Theme.reducedMotion})
    }
    Component.onCompleted: syncTheme()
    Connections { target: Ui.Theme; function onEffectiveSchemeChanged() { root.syncTheme() } function onReducedMotionChanged() { root.syncTheme() } }
    Connections { target: Ui.Typography; function onSansFamilyChanged() { root.syncTheme() } }
    readonly property bool runActive: editor && editor.runActive
    readonly property var currentJob: {
        const jobs = workflowSession.queue
        let latest = null
        for (const job of jobs) {
            if (job.workflow_id !== workflowSession.workflow.id || job.order === undefined) continue
            if (!latest || (latest.terminal && !job.terminal)
                || (!latest.terminal && !job.terminal && job.order < latest.order)
                || (latest.terminal && job.terminal && job.order > latest.order)) latest = job
        }
        return latest
    }
    readonly property int pendingRunCount: workflowSession.queue.filter(job =>
        job.workflow_id === workflowSession.workflow.id
        && ["queued", "scheduled", "starting"].includes(job.status)).length
    readonly property string runLabel: {
        const job = currentJob
        if (!job) return "Run entire workflow"
        if (job.stopping && !job.terminal) return "Stopping"
        if (job.queue_position != null && job.status === "queued") return "Queued (#" + job.queue_position + ")"
        if (["starting", "queued", "scheduled"].includes(job.status)) return "Starting"
        if (job.status === "running") return pendingRunCount > 0 ? "Running · " + pendingRunCount + " queued" : "Running"
        if (job.status === "failed" && !job.editedSinceError) return "Error · Retry"
        return "Run entire workflow"
    }
    readonly property string runTooltip: {
        const job = currentJob
        if (runLabel === "Stopping") return "Stopping workflow"
        if (runLabel === "Error · Retry") return (job.error || "Workflow failed to start") + ". Click to retry the entire workflow."
        if (job && job.queue_position != null && job.status === "queued") return "Queued (#" + job.queue_position + ")"
        if (pendingRunCount > 0) return "Running — " + pendingRunCount + " queued (click to queue another)"
        if (job && !job.terminal) return runLabel + " (click to queue another entire workflow run)"
        return "Run workflow (" + (Qt.platform.os === "osx" ? "Cmd" : "Ctrl") + "+Enter)"
    }
    implicitWidth: frame.implicitWidth
    implicitHeight: frame.implicitHeight
    component ActionButton: PanelRow {
        id: action
        property string glyph: ""
        property string primitiveGlyph: ""
        implicitWidth: Ui.Metrics.comfortable
        implicitHeight: Ui.Metrics.comfortable
        enabled: editor && (!editor.readOnly || !["Run", "Add node"].includes(text))
        objectName: "toolbar-" + text.toLowerCase().split(" ").join("-")
        onClicked: editor.action(text)
        HoverHandler { onHoveredChanged: if (hovered && editor) editor.showToolTip(action.text); else if (editor) editor.showToolTip("") }
        TypeIcon { anchors.centerIn: parent; visible: action.glyph !== ""; name: action.glyph; size: Ui.Metrics.iconMd; ink: action.enabled ? Ui.Theme.textSecondary : Ui.Theme.textDisabled }
        Ui.Icon { anchors.centerIn: parent; visible: action.primitiveGlyph !== ""; name: action.primitiveGlyph; size: Ui.Metrics.iconMd; tone: action.enabled ? Ui.Text.Secondary : Ui.Text.Disabled }
    }
    Rectangle {
        id: frame
        anchors.fill: parent
        color: roles.overlay
        radius: Ui.Metrics.lg
        border.width: Ui.Metrics.border
        border.color: roles.divider
        implicitWidth: row.implicitWidth + Ui.Metrics.sm * 2
        implicitHeight: row.implicitHeight + Ui.Metrics.sm * 2
        RowLayout {
            id: row
            anchors.centerIn: parent
            spacing: Ui.Metrics.xs
            ActionButton { text: "Add node"; glyph: "addCircle" }
            ActionButton { visible: !root.compact; text: "Undo"; primitiveGlyph: "undo" }
            ActionButton { visible: !root.compact; text: "Redo"; primitiveGlyph: "redo" }
            ActionButton { visible: !root.compact; text: "Open"; glyph: "folderOpen" }
            ActionButton { visible: !root.compact; text: "Save"; glyph: "save" }
            Item { Layout.preferredWidth: Ui.Metrics.md }
            PanelRow {
                id: runButton
                objectName: "run-workflow"
                readonly property string actionName: "Run"
                text: actionName
                accessibleName: "Run entire workflow"
                enabled: editor && !editor.readOnly && workflowSession.connected && root.runLabel !== "Stopping"
                implicitHeight: Ui.Metrics.comfortable
                implicitWidth: runRow.implicitWidth + Ui.Metrics.lg * 2
                onClicked: editor.action(actionName)
                HoverHandler {
                    onHoveredChanged: if (editor) editor.showToolTip(hovered ? root.runTooltip : "")
                }
                background: Rectangle {
                    radius: height / 2
                    color: !runButton.enabled ? Ui.Theme.actionDisabled : runButton.hovered ? Ui.Theme.accentHover : Ui.Theme.accentPrimary
                    border.width: runButton.visualFocus ? Ui.Metrics.focus : 0
                    border.color: Ui.Theme.textOnAccent
                }
                Row {
                    id: runRow
                    anchors.centerIn: parent
                    spacing: Ui.Metrics.xs
                    Ui.Icon { anchors.verticalCenter: parent.verticalCenter; name: "playArrow"; size: Ui.Metrics.iconMd; tone: Ui.Text.OnAccent }
                    Ui.Text { anchors.verticalCenter: parent.verticalCenter; visible: !root.compact; text: root.runLabel; role: Ui.Typography.SansLabel; font.weight: Font.Normal; tone: Ui.Text.OnAccent; lineHeight: 1 }
                }
            }
            Ui.ToolbarIconButton {
                objectName: "toggleEditorChat"
                text: qsTr("Conversation")
                iconName: "forum"
                onClicked: editor.toggleChat()
            }
            ActionButton { text: "More"; primitiveGlyph: "moreVert" }
        }
    }
}
