import QtQuick
import QtQuick.Layouts
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

Ui.Surface {
    id: root
    variant: Ui.Surface.Overlay
    elevated: true
    property bool expanded: false
    property var retained: []
    property var localStarts: ({})
    property double now: Date.now()
    readonly property var live: (workflowSession.queue || []).map((job, index) => Object.assign({}, job, {
            queueIndex: index
        }))
    readonly property int runningCount: live.filter(job => job.status === "running").length
    readonly property bool hasJobs: live.some(job => ["running", "queued", "scheduled", "starting"].includes(job.status))
    readonly property bool presented: hasJobs || exitDelay.running
    readonly property bool clockRunning: clock.running
    readonly property var rows: hasJobs ? live : retained
    readonly property var running: rows.filter(job => job.status === "running")
    readonly property var queued: rows.filter(job => ["queued", "scheduled", "starting"].includes(job.status))
    readonly property var cancelled: rows.filter(job => job.status === "cancelled")
    readonly property real contentHeight: expanded ? sections.implicitHeight + header.height + Ui.Metrics.xl * 2 : summary.implicitHeight + Ui.Metrics.lg * 2
    color: Ui.Theme.surfaceCanvas
    opacity: hasJobs ? 1 : 0
    scale: hasJobs || Ui.Theme.reducedMotion ? 1 : 0.98
    transformOrigin: Item.TopLeft
    transform: Translate {
        y: root.hasJobs || Ui.Theme.reducedMotion ? 0 : -Ui.Metrics.sm
        Behavior on y {
            NumberAnimation {
                duration: Ui.Theme.reducedMotion ? 0 : Ui.Metrics.motionNormal
            }
        }
    }
    Behavior on opacity {
        NumberAnimation {
            duration: Ui.Theme.reducedMotion ? 0 : Ui.Metrics.motionNormal
        }
    }
    Behavior on scale {
        NumberAnimation {
            duration: Ui.Theme.reducedMotion ? 0 : Ui.Metrics.motionNormal
        }
    }
    onLiveChanged: {
        if (hasJobs) {
            retained = live;
        }
        const starts = Object.assign({}, localStarts);
        for (const job of live) {
            if (job.status === "running" && !starts[job.jobId || job.id]) {
                starts[job.jobId || job.id] = Date.now();
            }
        }
        localStarts = starts;
    }
    onHasJobsChanged: {
        if (hasJobs) {
            exitDelay.stop();
        } else if (!Ui.Theme.reducedMotion) {
            exitDelay.restart();
        }
    }
    Timer {
        id: exitDelay
        interval: Ui.Metrics.motionNormal
    }
    Timer {
        id: clock
        interval: 1000
        repeat: true
        running: root.runningCount > 0
        onTriggered: root.now = Date.now()
    }
    function name(job) {
        return job.name || job.workflow_name || "Untitled";
    }
    function clockText(job) {
        const parsed = Date.parse(job.started_at || "");
        const start = isNaN(parsed) ? localStarts[job.jobId || job.id] : parsed;
        const total = Math.max(0, Math.floor((now - (start || now)) / 1000));
        return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
    }
    ColumnLayout {
        id: summary
        visible: !root.expanded
        anchors.fill: parent
        anchors.margins: Ui.Metrics.lg
        spacing: Ui.Metrics.md
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Ui.StatusDot {
                active: root.running.length > 0
            }
            Ui.Text {
                objectName: "queue-summary"
                Layout.fillWidth: true
                text: root.running.length === 1 ? root.name(root.running[0]) : root.running.length > 0 ? root.running.length + " jobs running" : "Queue"
                role: Ui.Typography.SansLabel
                elide: Text.ElideRight
            }
            Ui.Text {
                objectName: "queue-clock"
                visible: root.running.length === 1
                text: visible ? root.clockText(root.running[0]) : ""
                role: Ui.Typography.MonoCaption
                tone: Ui.Text.Secondary
            }
            Ui.ToolbarIconButton {
                objectName: "queue-toggle"
                iconName: "expandMore"
                accessibleName: "Expand queue"
                description: accessibleName
                onClicked: root.expanded = true
            }
        }
        Ui.Progress {
            visible: root.running.length > 0
            Layout.fillWidth: true
            implicitHeight: Ui.Metrics.xs
            indeterminate: true
            accessibleName: "Running"
        }
        RowLayout {
            visible: root.queued.length > 0
            Ui.Icon {
                name: "schedule"
                size: Ui.Metrics.iconXs
                tone: Ui.Text.Secondary
            }
            Ui.Text {
                objectName: "queue-queued-count"
                text: root.queued.length + " queued"
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
        }
    }
    ColumnLayout {
        visible: root.expanded
        anchors.fill: parent
        anchors.margins: Ui.Metrics.lg
        spacing: Ui.Metrics.none
        RowLayout {
            id: header
            Layout.fillWidth: true
            Ui.Icon {
                name: "layers"
            }
            Ui.Text {
                objectName: "queue-title"
                text: "Queue"
                role: Ui.Typography.SansLabel
                Layout.fillWidth: true
            }
            RowLayout {
                spacing: Ui.Metrics.xs
                Layout.alignment: Qt.AlignVCenter
                Ui.Icon {
                    name: "playArrow"
                    size: Ui.Metrics.iconXs
                    tone: Ui.Text.Secondary
                }
                Ui.Text {
                    objectName: "queue-header-running-count"
                    text: root.running.length
                    role: Ui.Typography.MonoCaption
                    tone: Ui.Text.Secondary
                }
                Ui.Icon {
                    name: "schedule"
                    size: Ui.Metrics.iconXs
                    tone: Ui.Text.Secondary
                }
                Ui.Text {
                    objectName: "queue-header-queued-count"
                    text: root.queued.length
                    role: Ui.Typography.MonoCaption
                    tone: Ui.Text.Secondary
                }
                Ui.ToolbarIconButton {
                    objectName: "queue-collapse"
                    iconName: "remove"
                    accessibleName: "Collapse queue"
                    description: accessibleName
                    onClicked: root.expanded = false
                }
            }
        }
        Basic.ScrollView {
            id: queueScroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            ColumnLayout {
                id: sections
                width: queueScroll.availableWidth
                spacing: Ui.Metrics.md
                Repeater {
                    model: [
                        {
                            title: "Running",
                            jobs: root.running
                        },
                        {
                            title: "Enqueued",
                            jobs: root.queued
                        },
                        {
                            title: "Cancelled",
                            jobs: root.cancelled
                        }
                    ]
                    delegate: ColumnLayout {
                        id: section
                        required property var modelData
                        visible: modelData.jobs.length > 0
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.md
                        Ui.Text {
                            objectName: "queue-section-" + section.modelData.title
                            text: section.modelData.title
                            role: Ui.Typography.SansCaption
                            tone: Ui.Text.Secondary
                            Layout.topMargin: Ui.Metrics.lg
                        }
                        Repeater {
                            model: section.modelData.jobs
                            delegate: Ui.Surface {
                                id: card
                                required property var modelData
                                required property int index
                                readonly property bool isRunning: modelData.status === "running"
                                readonly property string jobId: modelData.jobId || modelData.id || ""
                                readonly property bool focusable: isRunning && !!modelData.workflow_id && modelData.workflow_id === workflowSession.workflow.id
                                readonly property bool focused: focusable && runOutput.selectedRunId === jobId
                                objectName: "queue-focus-" + modelData.queueIndex
                                Layout.fillWidth: true
                                implicitHeight: cardContent.implicitHeight + Ui.Metrics.md * 2
                                opacity: modelData.status === "cancelled" ? 0.55 : 1
                                color: hover.hovered && focusable ? Ui.Theme.actionHover : Ui.Theme.surfaceOverlay
                                border.color: focused || activeFocus || (hover.hovered && focusable) ? Ui.Theme.borderFocus : Ui.Theme.borderSubtle
                                focus: false
                                activeFocusOnTab: focusable
                                Accessible.role: focusable ? Accessible.Button : Accessible.StaticText
                                Accessible.name: focusable ? "Show run on canvas" : root.name(modelData)
                                Accessible.checkable: focusable
                                Accessible.checked: focused
                                function activate() {
                                    if (focusable) {
                                        runOutput.selectRun(jobId);
                                    }
                                }
                                Keys.onReturnPressed: activate()
                                Keys.onEnterPressed: activate()
                                Keys.onSpacePressed: activate()
                                HoverHandler {
                                    id: hover
                                }
                                MouseArea {
                                    anchors.fill: parent
                                    enabled: card.focusable
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        card.forceActiveFocus();
                                        card.activate();
                                    }
                                }
                                Ui.Surface {
                                    visible: card.focused
                                    width: Ui.Metrics.micro + Ui.Metrics.border
                                    height: parent.height
                                    color: Ui.Theme.accentPrimary
                                    border.width: 0
                                }
                                ColumnLayout {
                                    id: cardContent
                                    anchors.fill: parent
                                    anchors.margins: Ui.Metrics.md
                                    spacing: Ui.Metrics.md
                                    RowLayout {
                                        Layout.fillWidth: true
                                        spacing: Ui.Metrics.md
                                        Ui.StatusDot {
                                            visible: section.modelData.title !== "Enqueued"
                                            active: card.isRunning
                                        }
                                        Ui.Text {
                                            visible: section.modelData.title === "Enqueued"
                                            text: "#" + (card.index + 1)
                                            role: Ui.Typography.MonoCaption
                                            tone: Ui.Text.Secondary
                                        }
                                        Ui.Text {
                                            Layout.fillWidth: true
                                            text: root.name(card.modelData)
                                            role: Ui.Typography.SansLabel
                                            elide: Text.ElideRight
                                        }
                                        Ui.Icon {
                                            visible: card.focused
                                            name: "visibility"
                                            size: Ui.Metrics.iconXs
                                        }
                                        Ui.Text {
                                            text: card.focused ? "On canvas" : card.isRunning ? root.clockText(card.modelData) : "Cancelled"
                                            visible: card.isRunning || section.modelData.title === "Cancelled"
                                            role: Ui.Typography.MonoCaption
                                            tone: Ui.Text.Secondary
                                        }
                                        Ui.CloseButton {
                                            objectName: "queue-stop-" + card.modelData.queueIndex
                                            visible: section.modelData.title !== "Cancelled"
                                            accessibleName: card.isRunning ? "Stop run" : "Remove from queue"
                                            description: accessibleName
                                            enabled: workflowSession.connected && !card.modelData.stopping
                                            onClicked: workflowSession.cancelJob(card.jobId)
                                        }
                                    }
                                    Ui.Progress {
                                        visible: card.isRunning
                                        Layout.fillWidth: true
                                        implicitHeight: Ui.Metrics.xs
                                        indeterminate: true
                                        accessibleName: "Running"
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
