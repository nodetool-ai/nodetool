import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// Canvas actions and the embedded conversation entry point.
Item {
    id: root
    required property EditorCommands commands
    required property RunState runs
    // A narrow canvas keeps the run icon and drops its label, as the web does.
    property bool compact: false
    EditorRoles { id: roles }
    function syncTheme() {
        root.commands.present({subgraphAccent: roles.subgraphAccent, controlWire: roles.controlWire, canvas: roles.canvas, grid: roles.grid, node: roles.node, reroutePaper: roles.reroutePaper, rerouteBorder: roles.rerouteBorder, groupHeader: roles.groupHeader, groupFill: roles.groupFill, zoomedTitle: roles.zoomedTitle, previewSelected: roles.previewSelected, outputSelected: roles.outputSelected, panel: roles.panel, overlay: roles.overlay, divider: roles.divider, field: roles.field, checker: roles.checker, shadow: roles.shadow, mediaScrim: roles.mediaScrim, mediaScrimInk: roles.mediaScrimInk, alphaBase: roles.alphaBase, alphaChecker: roles.alphaChecker, primary: Ui.Theme.accentPrimary, progress: Ui.Theme.accentSecondary, text: Ui.Theme.textPrimary, secondary: Ui.Theme.textSecondary, border: roles.divider, focus: Ui.Theme.borderFocus, error: Ui.Theme.statusError, warning: Ui.Theme.statusWarning, success: Ui.Theme.statusSuccess, info: Ui.Theme.statusInfo, sans: Ui.Typography.sansFamily, mono: Ui.Typography.monoFamily, captionSize: Ui.Typography.pixelSize(Ui.Typography.SansCaption), borderWidth: Math.round(Ui.Metrics.border), spaceXs: Math.round(Ui.Metrics.xs), spaceMd: Math.round(Ui.Metrics.md), reducedMotion: Ui.Theme.reducedMotion, motionNormal: Ui.Metrics.motionNormal})
    }
    Component.onCompleted: syncTheme()
    Connections { target: Ui.Theme; function onEffectiveSchemeChanged() { root.syncTheme() } function onReducedMotionChanged() { root.syncTheme() } }
    Connections { target: Ui.Typography; function onSansFamilyChanged() { root.syncTheme() } }
    readonly property bool runActive: root.commands.running
    readonly property var currentJob: {
        const jobs = root.runs.queue
        let latest = null
        for (const job of jobs) {
            if (job.workflow_id !== root.runs.workflowId || job.order === undefined) continue
            if (!latest || (latest.terminal && !job.terminal)
                || (!latest.terminal && !job.terminal && job.order < latest.order)
                || (latest.terminal && job.terminal && job.order > latest.order)) latest = job
        }
        return latest
    }
    readonly property int pendingRunCount: root.runs.queue.filter(job =>
        job.workflow_id === root.runs.workflowId
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
    // The web counts the clock from the moment the run reports running.
    // See web/src/hooks/useRunningTime.ts and web/src/utils/timeFormat.ts.
    readonly property bool workflowRunning: currentJob !== null && !currentJob.terminal && currentJob.status === "running"
    property double runStartedAt: 0
    property int elapsedSeconds: 0
    readonly property string elapsedText: {
        const hours = Math.floor(elapsedSeconds / 3600)
        const minutes = Math.floor((elapsedSeconds % 3600) / 60)
        const seconds = String(elapsedSeconds % 60).padStart(2, "0")
        if (hours > 0) {
            return hours + ":" + String(minutes).padStart(2, "0") + ":" + seconds
        }
        return minutes + ":" + seconds
    }
    onWorkflowRunningChanged: {
        runStartedAt = workflowRunning ? Date.now() : 0
        elapsedSeconds = 0
    }
    Timer {
        interval: 1000
        repeat: true
        running: root.workflowRunning
        onTriggered: root.elapsedSeconds = Math.floor((Date.now() - root.runStartedAt) / 1000)
    }
    implicitWidth: frame.implicitWidth
    implicitHeight: frame.implicitHeight
    // The web toolbar: Add node and Auto layout on the left, then Stop while a
    // run is active, Run and the workflow menu. See web/src/components/panels/FloatingToolBar.tsx.
    component ActionButton: Ui.ToolbarIconButton {
        id: action
        property string glyph: ""
        property string tooltip: text
        property string shortcut: ""
        implicitWidth: Ui.Metrics.compact
        implicitHeight: Ui.Metrics.compact
        enabled: !root.commands.readOnly || !["Run", "Add node", "Auto layout"].includes(text)
        objectName: "toolbar-" + text.toLowerCase().split(" ").join("-")
        accessibleName: tooltip
        shortcutText: shortcut
        iconName: glyph
        iconTone: enabled ? Ui.Text.Secondary : Ui.Text.Disabled
        onClicked: root.commands.run(text)
    }
    Rectangle {
        id: frame
        anchors.fill: parent
        color: roles.overlay
        radius: Ui.Metrics.radiusOverlay
        border.width: Ui.Metrics.border
        border.color: roles.divider
        implicitWidth: row.implicitWidth + (Ui.Metrics.xs + Ui.Metrics.border) * 2
        implicitHeight: row.implicitHeight + (Ui.Metrics.xs + Ui.Metrics.border) * 2
        RowLayout {
            id: row
            anchors.centerIn: parent
            spacing: Ui.Metrics.md
            Row {
                spacing: Ui.Metrics.xs
                ActionButton {
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Add node"
                    glyph: "addCircle"
                    shortcut: "Space"
                }
                // A phone keeps Auto layout in the workflow menu, as the web does.
                ActionButton {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: !root.compact
                    text: "Auto layout"
                    glyph: "autoFixHigh"
                }
            }
            Row {
                spacing: Ui.Metrics.xs
                ActionButton {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: root.runActive
                    text: "Stop"
                    glyph: "stop"
                    accessibleName: root.runLabel === "Stopping" ? "Stopping workflow" : "Stop workflow"
                    shortcut: "Esc"
                    enabled: root.runLabel !== "Stopping"
                }
                // ComfyTargetSelector: where this Comfy workflow runs. The menu is the window's.
                Ui.ListRow {
                    id: comfyTarget
                    flat: true
                    objectName: "toolbar-comfy-target"
                    anchors.verticalCenter: parent.verticalCenter
                    visible: root.commands.comfyTarget !== ""
                    text: root.commands.comfyTarget
                    accessibleName: "Where this Comfy workflow runs: " + text
                    implicitHeight: Ui.Metrics.compact
                    implicitWidth: comfyTargetLabel.implicitWidth + Ui.Metrics.md * 2
                    onClicked: root.commands.run("Comfy target")
                    Ui.Tooltip {
                        trigger: comfyTarget
                        visible: comfyTarget.hovered
                        text: "Where this Comfy workflow runs"
                    }
                    Ui.Text {
                        id: comfyTargetLabel
                        anchors.centerIn: parent
                        text: comfyTarget.text
                        role: Ui.Typography.SansLabel
                        tone: Ui.Text.Secondary
                        tight: true
                    }
                }
                Ui.ListRow {
                    id: runButton
                    flat: true
                    objectName: "run-workflow"
                    readonly property string actionName: "Run"
                    anchors.verticalCenter: parent.verticalCenter
                    text: actionName
                    accessibleName: root.runActive ? root.runLabel + " (click to queue another entire workflow run)" : root.runLabel
                    enabled: !root.commands.readOnly && root.runs.connected && root.runLabel !== "Stopping"
                    implicitHeight: Ui.Metrics.comfortable
                    implicitWidth: Math.ceil(Math.max(Ui.Metrics.comfortable, runRow.implicitWidth + Ui.Metrics.lg * 2))
                    onClicked: root.commands.run(actionName)
                    Ui.Tooltip {
                        trigger: runButton
                        visible: runButton.hovered && text !== ""
                        text: root.runTooltip
                    }
                    // A running workflow turns the pill to the panel surface.
                    background: Rectangle {
                        radius: Ui.Metrics.radiusPill
                        color: root.runActive ? (runButton.hovered ? Ui.Theme.actionHover : Ui.Theme.surfacePanel)
                            : !runButton.enabled ? Ui.Theme.actionDisabled
                            : runButton.hovered ? Ui.Theme.accentHover : Ui.Theme.accentPrimary
                        border.width: runButton.visualFocus ? Ui.Metrics.focus : 0
                        border.color: root.runActive ? Ui.Theme.borderFocus : Ui.Theme.textOnAccent
                    }
                    Row {
                        id: runRow
                        anchors.centerIn: parent
                        spacing: Ui.Metrics.xs
                        Ui.Icon {
                            anchors.verticalCenter: parent.verticalCenter
                            visible: !root.runActive || root.runLabel === "Error · Retry"
                            name: "playArrow"
                            size: Ui.Metrics.iconMd
                            tone: Ui.Text.OnAccent
                        }
                        Ui.Text {
                            objectName: "run-elapsed"
                            anchors.verticalCenter: parent.verticalCenter
                            visible: root.workflowRunning
                            text: root.elapsedText
                            role: Ui.Typography.MonoCaption
                            weight: Font.DemiBold
                            tight: true
                        }
                        Ui.Text {
                            objectName: "run-label"
                            anchors.verticalCenter: parent.verticalCenter
                            visible: !root.compact
                            text: root.runLabel
                            role: Ui.Typography.SansLabel
                            weight: Font.Normal
                            tone: root.runActive ? Ui.Text.Primary : Ui.Text.OnAccent
                            tight: true
                        }
                    }
                }
                ActionButton {
                    anchors.verticalCenter: parent.verticalCenter
                    text: "More"
                    glyph: "moreVert"
                    tooltip: "Workflow actions"
                }
            }
        }
    }
}
