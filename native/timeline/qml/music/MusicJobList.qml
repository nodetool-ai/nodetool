// The job list of the music panel (docs/MUSIC-MODE.md section 15, part 6; section
// 13, JB-4, JB-5): one row per job of this timeline, newest first, with its state,
// its time against the expected time (time alone until a job of that kind has
// finished), the backend's error, and Cancel, Retry or Place. Copy follows the
// music mode mockup.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Column {
    id: root
    objectName: "musicJobList"
    // The editor's MusicJobs.
    property var jobs: null
    spacing: Ui.Metrics.sm

    function clock(ms) {
        const total = Math.max(0, Math.floor(ms / 1000))
        const seconds = total % 60
        return Math.floor(total / 60) + ":" + (seconds < 10 ? "0" : "") + seconds
    }
    function meta(row) {
        switch (row.state) {
        case "rendering":
            return row.operation === "repaint" ? qsTr("Rendering a dry bounce of the track") : qsTr("Rendering a mix of the other tracks")
        case "queued": return qsTr("Waiting for the job ahead")
        case "running":
            return row.expectedMs > 0 ? qsTr("%1 of about %2").arg(clock(row.elapsedMs)).arg(clock(row.expectedMs))
                                      : qsTr("%1 elapsed · no estimate yet").arg(clock(row.elapsedMs))
        case "placing": return qsTr("Writing takes to the clip")
        case "done":
            if (row.canPlace) return qsTr("Placeholder was removed. Takes are kept here.")
            return (row.placedCount === 1 ? qsTr("1 take placed") : qsTr("%1 takes placed").arg(row.placedCount))
                + (row.seed >= 0 ? qsTr(" · seed %1").arg(row.seed) : "")
        case "cancelled": return qsTr("Cancelled")
        default: return ""
        }
    }

    Ui.Text {
        objectName: "musicJobsEmpty"
        visible: !root.jobs || jobView.count === 0
        width: parent.width
        text: qsTr("No jobs yet.")
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Secondary
    }

    ListView {
        id: jobView
        objectName: "musicJobRows"
        width: parent.width
        height: contentHeight
        interactive: false
        spacing: Ui.Metrics.sm
        // The model lists jobs oldest first; the newest shows on top.
        verticalLayoutDirection: ListView.BottomToTop
        model: root.jobs ? root.jobs.jobList : null
        delegate: Rectangle {
            id: row
            required property var model
            readonly property var job: model
            objectName: "musicJob_" + job.jobId
            width: ListView.view.width
            height: body.height + 2 * Ui.Metrics.md
            radius: Ui.Metrics.radiusCard
            color: Ui.Theme.surfacePanel
            border.width: Ui.Metrics.border
            border.color: job.state === "failed" ? Ui.Theme.borderError : Ui.Theme.borderSubtle

            Column {
                id: body
                x: Ui.Metrics.md
                y: Ui.Metrics.md
                width: parent.width - 2 * Ui.Metrics.md
                spacing: Ui.Metrics.xs
                Row {
                    width: parent.width
                    spacing: Ui.Metrics.sm
                    Rectangle {
                        objectName: "musicJobState"
                        property string text: row.job.state.toUpperCase()
                        anchors.verticalCenter: parent.verticalCenter
                        width: stateText.implicitWidth + 2 * Ui.Metrics.xs
                        height: stateText.implicitHeight
                        radius: Ui.Metrics.radiusControl
                        color: row.job.state === "failed" ? Ui.Theme.statusErrorSurface
                             : row.job.state === "running" || row.job.state === "placing" ? Ui.Theme.actionSelected : Ui.Theme.surfaceOverlay
                        Ui.Text {
                            id: stateText
                            anchors.centerIn: parent
                            text: parent.text
                            role: Ui.Typography.MonoCaption
                            tone: row.job.state === "failed" ? Ui.Text.Error : row.job.state === "done" ? Ui.Text.Success : Ui.Text.Secondary
                        }
                    }
                    Ui.Text {
                        objectName: "musicJobTitle"
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - x - actions.width - parent.spacing
                        text: row.job.title
                        role: Ui.Typography.SansLabel
                        elide: Text.ElideRight
                    }
                    Row {
                        id: actions
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Ui.Metrics.xs
                        Ui.EditorButton {
                            objectName: "musicJobCancel"
                            visible: row.job.canCancel
                            density: Ui.EditorButton.Compact
                            text: qsTr("Cancel")
                            onClicked: root.jobs.cancel(row.job.jobId)
                        }
                        Ui.EditorButton {
                            objectName: "musicJobRetry"
                            visible: row.job.canRetry
                            density: Ui.EditorButton.Compact
                            text: qsTr("Retry")
                            onClicked: root.jobs.retry(row.job.jobId)
                        }
                        Ui.EditorButton {
                            objectName: "musicJobPlace"
                            visible: row.job.canPlace
                            density: Ui.EditorButton.Compact
                            text: qsTr("Place takes")
                            onClicked: root.jobs.placeOrphan(row.job.jobId)
                        }
                    }
                }
                Ui.Text {
                    objectName: "musicJobMeta"
                    visible: text !== ""
                    width: parent.width
                    text: root.meta(row.job)
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.MonoCaption
                    tone: Ui.Text.Secondary
                }
                Ui.Progress {
                    objectName: "musicJobProgress"
                    visible: row.job.state === "running" && row.job.expectedMs > 0
                    width: parent.width
                    from: 0
                    to: 1
                    value: row.job.expectedMs > 0 ? Math.min(1, row.job.elapsedMs / row.job.expectedMs) : 0
                    accessibleName: qsTr("Progress against the expected time")
                }
                Ui.Text {
                    objectName: "musicJobError"
                    visible: row.job.error !== ""
                    width: parent.width
                    text: row.job.error
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: row.job.state === "failed" ? Ui.Text.Error : Ui.Text.Secondary
                }
            }
        }
    }
}
