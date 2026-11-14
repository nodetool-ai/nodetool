import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Ui.Surface {
    id: root
    variant: Ui.Surface.Overlay
    elevated: true
    property bool expanded: false
    // Set by the owner when the status bar opens the queue. An opened queue
    // shows with no active jobs, as the web QueuePanel does.
    property bool opened: false
    property string historyFilter: "all"
    property var retained: []
    property var localStarts: ({})
    property double now: Date.now()
    // The debounced queue, the open workflow, the run output's selected run and
    // the cancel, select and report requests.
    required property RunState runs
    // The tab's MediaResolver, which loads the history's image outputs.
    property var resolver: null
    readonly property var source: runs.queue
    readonly property var live: source.map((job, index) => Object.assign({}, job, {
            queueIndex: index
        }))
    readonly property int runningCount: live.filter(job => job.status === "running").length
    readonly property bool hasJobs: live.some(job => ["running", "queued", "scheduled", "starting"].includes(job.status))
    readonly property bool shown: hasJobs || opened
    readonly property bool presented: shown || exitDelay.running
    // Without active jobs there is nothing to summarize, so the opened queue lists everything.
    readonly property bool showList: expanded || (opened && !hasJobs)
    readonly property bool clockRunning: clock.running
    readonly property var rows: shown ? live : retained
    readonly property var running: rows.filter(job => job.status === "running")
    readonly property var queued: rows.filter(job => ["queued", "scheduled", "starting"].includes(job.status))
    // Finished jobs, newest first: QueuePanel.tsx's history.
    readonly property var history: rows.filter(job => !["running", "queued", "scheduled", "starting"].includes(job.status)).sort((a, b) => jobTime(b) - jobTime(a))
    readonly property var historyCounts: ({
            all: history.length,
            failed: history.filter(job => historyBucket(job) === "failed").length,
            completed: history.filter(job => historyBucket(job) === "completed").length,
            cancelled: history.filter(job => historyBucket(job) === "cancelled").length
        })
    // A filter whose last job left the list falls back to everything.
    readonly property string activeHistoryFilter: historyCounts[historyFilter] > 0 ? historyFilter : "all"
    readonly property var historyGroups: groupByDay(activeHistoryFilter === "all" ? history : history.filter(job => historyBucket(job) === activeHistoryFilter))
    readonly property real contentHeight: showList ? sections.implicitHeight + header.height + Ui.Metrics.xl * 2 : summary.implicitHeight + Ui.Metrics.lg * 2
    color: Ui.Theme.surfaceCanvas
    opacity: shown ? 1 : 0
    scale: shown || Ui.Theme.reducedMotion ? 1 : 0.98
    transformOrigin: Item.TopLeft
    transform: Translate {
        y: root.shown || Ui.Theme.reducedMotion ? 0 : -Ui.Metrics.sm
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
        if (shown) {
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
    onShownChanged: {
        if (shown) {
            retained = live;
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
    // isFailed and historyBucket in QueuePanel.tsx.
    function historyBucket(job) {
        if (job.status === "cancelled") {
            return "cancelled";
        }
        return job.status === "failed" || job.status === "timed_out" || !!job.error ? "failed" : "completed";
    }
    function jobTime(job) {
        const parsed = Date.parse(job.finished_at || job.started_at || "");
        return isNaN(parsed) ? 0 : parsed;
    }
    // groupByDate in web/src/utils/groupByDate.ts, by calendar day.
    function dayLabel(time) {
        if (!time) {
            return "Earlier";
        }
        const today = new Date(now);
        const day = new Date(time);
        const days = Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())) / 86400000);
        return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? days + " days ago" : Qt.formatDate(day, Qt.locale().dateFormat(Locale.ShortFormat));
    }
    function groupByDay(jobs) {
        const groups = [];
        for (const job of jobs) {
            const label = dayLabel(jobTime(job));
            const last = groups[groups.length - 1];
            if (last && last.label === label) {
                last.jobs.push(job);
            } else {
                groups.push({
                    label: label,
                    jobs: [job]
                });
            }
        }
        return groups;
    }
    // formatDuration in JobItem.tsx.
    function formatDuration(ms) {
        if (ms < 1000) {
            return Math.max(0, ms) + "ms";
        }
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) {
            return seconds + "." + String(ms % 1000).padStart(3, "0").slice(0, 2) + "s";
        }
        if (seconds < 3600) {
            return Math.floor(seconds / 60) + "m " + (seconds % 60) + "s";
        }
        return Math.floor(seconds / 3600) + "h " + Math.floor((seconds % 3600) / 60) + "m";
    }
    function jobDuration(job) {
        const start = Date.parse(job.started_at || "");
        const end = Date.parse(job.finished_at || "");
        return isNaN(start) || isNaN(end) ? "" : formatDuration(end - start);
    }
    // countText in JobItem.tsx: "2 images", named after the first output.
    function outputCount(job) {
        const outputs = job.outputAssets || [];
        if (outputs.length === 0) {
            return "";
        }
        const type = String(outputs[0].content_type || "");
        const noun = type.startsWith("video/") ? "video" : type.startsWith("image/") ? "image" : "asset";
        return outputs.length + " " + noun + (outputs.length === 1 ? "" : "s");
    }
    function clockLabel(iso) {
        const parsed = Date.parse(iso || "");
        return isNaN(parsed) ? "" : Qt.formatTime(new Date(parsed), Qt.locale().timeFormat(Locale.ShortFormat));
    }
    // metaText in JobItem.tsx for a finished job.
    function historyMeta(job) {
        const bucket = historyBucket(job);
        if (bucket === "failed") {
            return job.error || "Failed";
        }
        if (bucket === "cancelled") {
            return ["Cancelled", clockLabel(job.finished_at)].filter(part => !!part).join(" · ");
        }
        return [jobDuration(job), outputCount(job), clockLabel(job.finished_at)].filter(part => !!part).join(" · ") || "Completed";
    }
    function close() {
        expanded = false;
        opened = false;
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
        visible: !root.showList
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
        visible: root.showList
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
                    accessibleName: root.hasJobs ? "Collapse queue" : "Close queue"
                    description: accessibleName
                    onClicked: {
                        if (root.hasJobs) {
                            root.expanded = false;
                        } else {
                            root.close();
                        }
                    }
                }
            }
        }
        Ui.ScrollArea {
            id: queueScroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            ColumnLayout {
                id: sections
                width: queueScroll.availableWidth
                spacing: Ui.Metrics.md
                // QueuePanel.tsx's error state when the account's jobs fail to load.
                Ui.Status {
                    objectName: "queue-jobs-error"
                    visible: root.runs.jobsError !== ""
                    Layout.fillWidth: true
                    Layout.topMargin: Ui.Metrics.lg
                    status: Ui.Status.Error
                    message: "Could not load jobs"
                    wrap: true
                }
                // QueuePanel.tsx's Active section: running and queued jobs, or its empty state.
                RowLayout {
                    Layout.fillWidth: true
                    Layout.topMargin: Ui.Metrics.lg
                    Ui.Text {
                        objectName: "queue-section-Active"
                        text: "Active"
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        Layout.fillWidth: true
                    }
                    Ui.Text {
                        objectName: "queue-active-summary"
                        text: [root.running.length > 0 ? root.running.length + " running" : "", root.queued.length > 0 ? root.queued.length + " queued" : ""].filter(part => !!part).join(" · ")
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                }
                ColumnLayout {
                    objectName: "queue-active-empty"
                    visible: root.running.length + root.queued.length === 0
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.xs
                    Ui.Text {
                        Layout.fillWidth: true
                        text: "Nothing running or queued"
                        role: Ui.Typography.SansLabel
                        wrapMode: Text.Wrap
                    }
                    Ui.Text {
                        Layout.fillWidth: true
                        text: "Runs show up here while they work."
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        wrapMode: Text.Wrap
                    }
                }
                Repeater {
                    model: [
                        {
                            title: "Running",
                            jobs: root.running
                        },
                        {
                            title: "Enqueued",
                            jobs: root.queued
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
                                readonly property bool focusable: isRunning && !!modelData.workflow_id && modelData.workflow_id === root.runs.workflowId
                                readonly property bool focused: focusable && root.runs.selectedRunId === jobId
                                objectName: "queue-focus-" + modelData.queueIndex
                                Layout.fillWidth: true
                                implicitHeight: cardContent.implicitHeight + Ui.Metrics.md * 2
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
                                        root.runs.selectRun(jobId);
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
                                            text: card.focused ? "On canvas" : root.clockText(card.modelData)
                                            visible: card.isRunning
                                            role: Ui.Typography.MonoCaption
                                            tone: Ui.Text.Secondary
                                        }
                                        Ui.CloseButton {
                                            objectName: "queue-stop-" + card.modelData.queueIndex
                                            accessibleName: card.isRunning ? "Stop run" : "Remove from queue"
                                            description: accessibleName
                                            enabled: root.runs.connected && !card.modelData.stopping
                                            onClicked: root.runs.cancelJob(card.jobId)
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
                // QueuePanel.tsx's History section: finished jobs by day, with filters.
                Ui.Text {
                    objectName: "queue-section-History"
                    text: "History"
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    Layout.topMargin: Ui.Metrics.lg
                }
                Flow {
                    objectName: "queue-history-filters"
                    visible: root.historyCounts.all > 0
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.xs
                    Accessible.role: Accessible.Grouping
                    Accessible.name: "Filter history"
                    Repeater {
                        model: [{key: "all", label: "All"}, {key: "failed", label: "Failed"}, {key: "completed", label: "Completed"}, {key: "cancelled", label: "Cancelled"}]
                        Ui.EditorButton {
                            id: chip
                            required property var modelData
                            objectName: "queue-filter-" + chip.modelData.key
                            visible: chip.modelData.key === "all" || root.historyCounts[chip.modelData.key] > 0
                            text: chip.modelData.label + " " + root.historyCounts[chip.modelData.key]
                            density: Ui.EditorButton.Compact
                            variant: Ui.EditorButton.Flat
                            textTone: chip.modelData.key === "failed" ? Ui.Text.Error : Ui.Text.Primary
                            active: root.activeHistoryFilter === chip.modelData.key
                            onClicked: root.historyFilter = chip.modelData.key
                        }
                    }
                }
                ColumnLayout {
                    objectName: "queue-history-empty"
                    visible: root.historyGroups.length === 0
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.xs
                    Ui.Text {
                        Layout.fillWidth: true
                        text: "No finished runs yet"
                        role: Ui.Typography.SansLabel
                        wrapMode: Text.Wrap
                    }
                    Ui.Text {
                        Layout.fillWidth: true
                        text: "Completed, failed and cancelled runs are listed here."
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        wrapMode: Text.Wrap
                    }
                }
                Repeater {
                    model: root.historyGroups
                    delegate: ColumnLayout {
                        id: group
                        required property var modelData
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.xs
                        Ui.Text {
                            objectName: "queue-day-" + group.modelData.label
                            text: group.modelData.label
                            role: Ui.Typography.SansCaption
                            tone: Ui.Text.Secondary
                        }
                        Repeater {
                            model: group.modelData.jobs
                            // JobItem.tsx: status tile, name and short id, meta line,
                            // outputs, and Report on a failed job. A click opens the workflow.
                            delegate: Ui.Surface {
                                id: historyRow
                                required property var modelData
                                readonly property bool failed: root.historyBucket(modelData) === "failed"
                                readonly property bool cancelled: modelData.status === "cancelled"
                                readonly property string jobId: modelData.jobId || modelData.id || ""
                                readonly property bool opens: !!modelData.workflow_id
                                readonly property var outputs: modelData.outputAssets || []
                                objectName: "queue-history-" + jobId
                                Layout.fillWidth: true
                                implicitHeight: historyContent.implicitHeight + Ui.Metrics.md * 2
                                // Failed runs keep a faint error wash so they stand out in history.
                                color: failed ? Ui.Theme.statusErrorSurface : rowHover.hovered && opens ? Ui.Theme.actionHover : Ui.Theme.surfaceOverlay
                                border.color: activeFocus ? Ui.Theme.borderFocus : failed ? Ui.Theme.borderError : Ui.Theme.borderSubtle
                                activeFocusOnTab: opens
                                Accessible.role: opens ? Accessible.Button : Accessible.ListItem
                                Accessible.name: opens ? "Open " + root.name(modelData) : root.name(modelData)
                                Accessible.description: root.historyMeta(modelData)
                                function open() {
                                    if (opens) {
                                        root.runs.openJobWorkflow(modelData.workflow_id);
                                    }
                                }
                                Keys.onReturnPressed: open()
                                Keys.onEnterPressed: open()
                                Keys.onSpacePressed: open()
                                HoverHandler {
                                    id: rowHover
                                }
                                MouseArea {
                                    anchors.fill: parent
                                    enabled: historyRow.opens
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        historyRow.forceActiveFocus();
                                        historyRow.open();
                                    }
                                }
                                RowLayout {
                                    id: historyContent
                                    anchors.fill: parent
                                    anchors.margins: Ui.Metrics.md
                                    spacing: Ui.Metrics.md
                                    // StatusTile in JobItem.tsx.
                                    Ui.Surface {
                                        objectName: "queue-history-status-" + historyRow.jobId
                                        readonly property color tint: historyRow.failed ? Ui.Theme.statusError : historyRow.cancelled ? Ui.Theme.textSecondary : Ui.Theme.statusSuccess
                                        Layout.preferredWidth: Ui.Metrics.comfortable
                                        Layout.preferredHeight: Ui.Metrics.comfortable
                                        radius: Ui.Metrics.radiusCard
                                        border.width: 0
                                        color: historyRow.cancelled ? Ui.Theme.actionSelected : Qt.alpha(tint, 0.16)
                                        Ui.Icon {
                                            anchors.centerIn: parent
                                            name: historyRow.failed ? "error" : historyRow.cancelled ? "block" : "check"
                                            tone: historyRow.failed ? Ui.Text.Error : historyRow.cancelled ? Ui.Text.Secondary : Ui.Text.Success
                                            size: Ui.Metrics.iconSm
                                        }
                                    }
                                    ColumnLayout {
                                        Layout.fillWidth: true
                                        spacing: Ui.Metrics.micro
                                        RowLayout {
                                            Layout.fillWidth: true
                                            spacing: Ui.Metrics.md
                                            Ui.Text {
                                                // Elides only when the short id would not fit beside it.
                                                Layout.maximumWidth: parent.width - shortId.implicitWidth - parent.spacing
                                                text: root.name(historyRow.modelData)
                                                textFormat: Text.PlainText
                                                role: Ui.Typography.SansLabel
                                                elide: Text.ElideRight
                                            }
                                            Ui.Text {
                                                id: shortId
                                                objectName: "queue-history-id-" + historyRow.jobId
                                                text: "#" + historyRow.jobId.slice(0, 4)
                                                role: Ui.Typography.MonoCaption
                                                tone: Ui.Text.Secondary
                                                HoverHandler {
                                                    id: idHover
                                                }
                                                Ui.Tooltip {
                                                    trigger: shortId
                                                    visible: idHover.hovered
                                                    text: historyRow.jobId
                                                }
                                            }
                                        }
                                        Ui.Text {
                                            objectName: "queue-history-meta-" + historyRow.jobId
                                            Layout.fillWidth: true
                                            text: root.historyMeta(historyRow.modelData)
                                            textFormat: Text.PlainText
                                            role: Ui.Typography.SansCaption
                                            tone: historyRow.failed ? Ui.Text.Error : Ui.Text.Secondary
                                            elide: Text.ElideRight
                                        }
                                    }
                                    // The job's outputs, right-aligned; scrolls sideways when there are many.
                                    ListView {
                                        objectName: "queue-history-outputs-" + historyRow.jobId
                                        visible: historyRow.outputs.length > 0
                                        orientation: ListView.Horizontal
                                        spacing: Ui.Metrics.micro
                                        clip: true
                                        boundsBehavior: Flickable.StopAtBounds
                                        Layout.preferredHeight: Ui.Metrics.comfortable
                                        Layout.preferredWidth: Math.min(contentWidth, (Ui.Metrics.comfortable + Ui.Metrics.micro) * 3)
                                        model: historyRow.outputs
                                        delegate: Ui.Surface {
                                            id: thumb
                                            required property var modelData
                                            required property int index
                                            readonly property string contentType: String(modelData.content_type || "")
                                            readonly property bool isImage: contentType.startsWith("image/")
                                            objectName: "queue-output-" + historyRow.jobId + "-" + index
                                            width: Ui.Metrics.comfortable
                                            height: Ui.Metrics.comfortable
                                            radius: Ui.Metrics.radiusCard
                                            variant: Ui.Surface.Canvas
                                            clip: true
                                            activeFocusOnTab: !!modelData.get_url
                                            Accessible.role: Accessible.Button
                                            Accessible.name: "Open job output"
                                            Accessible.description: modelData.name || contentType
                                            Keys.onReturnPressed: root.runs.openJobOutput(modelData.get_url || "")
                                            Keys.onSpacePressed: root.runs.openJobOutput(modelData.get_url || "")
                                            Loader {
                                                anchors.fill: parent
                                                active: thumb.isImage && !!root.resolver && !!thumb.modelData.id
                                                source: "JobOutputThumb.qml"
                                                onLoaded: {
                                                    item.resolver = root.resolver;
                                                    item.assetId = thumb.modelData.id;
                                                }
                                            }
                                            Ui.Text {
                                                anchors.fill: parent
                                                anchors.margins: Ui.Metrics.micro
                                                visible: !thumb.isImage || !root.resolver
                                                text: thumb.contentType.split("/")[1] || "file"
                                                role: Ui.Typography.SansCaption
                                                tone: Ui.Text.Secondary
                                                horizontalAlignment: Text.AlignHCenter
                                                verticalAlignment: Text.AlignVCenter
                                                elide: Text.ElideRight
                                            }
                                            HoverHandler {
                                                id: thumbHover
                                            }
                                            Ui.Tooltip {
                                                trigger: thumb
                                                visible: thumbHover.hovered
                                                text: thumb.modelData.name || thumb.contentType
                                            }
                                            MouseArea {
                                                anchors.fill: parent
                                                enabled: !!thumb.modelData.get_url
                                                cursorShape: Qt.PointingHandCursor
                                                onClicked: root.runs.openJobOutput(thumb.modelData.get_url)
                                            }
                                        }
                                    }
                                    // ReportBugButton on a failed JobItem.
                                    Ui.EditorButton {
                                        objectName: "queue-report-" + historyRow.jobId
                                        visible: historyRow.failed
                                        density: Ui.EditorButton.Compact
                                        variant: Ui.EditorButton.Flat
                                        text: qsTr("Report")
                                        accessibleName: qsTr("Report this job failure")
                                        onClicked: root.runs.reportJob(historyRow.jobId)
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
