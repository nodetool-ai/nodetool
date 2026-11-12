// nt-panel: slot=clipBody id=musicClipJob order=25 title="Music job"
// Music job state on a clip (docs/MUSIC-MODE.md sections 9.1, 9.2 and 15, GN-7,
// AL-4): a placeholder clip shows a hatched fill, the job's title and its state;
// a clip under a running Regenerate job shows a hatched band over the bars being
// replaced; a generated music clip names its active take and shows a drift badge
// when that take drifts. The take count stays with the existing take badge. The
// state comes from the editor's MusicJobs and is never written to the document.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    property var clip: ({})
    property var timeline: null
    property var gestures: null
    property var viewState: null
    anchors.fill: parent

    // Only music clips look for the job module: other clips pay one property read.
    readonly property bool musicClip: clip.audioRole === "music" || clip.status === "queued"
    readonly property var jobs: musicClip ? jobsAbove() : null
    function jobsAbove() {
        let item = parent
        while (item) {
            if (item.musicJobs !== undefined) return item.musicJobs
            item = item.parent
        }
        return null
    }
    readonly property var job: jobs ? jobs.clipJobs[clip.id] : undefined
    readonly property bool placeholder: clip.status === "queued"
    readonly property var bands: jobs ? jobs.bands.filter(band => band.clipId === clip.id) : []
    readonly property var activeTake: {
        const versions = clip.versions || []
        let byAsset = null
        for (const take of versions) {
            if (take.id === clip.activeTakeId && take.assetId === clip.currentAssetId) return take
            if (!byAsset && take.assetId === clip.currentAssetId) byAsset = take
        }
        return byAsset
    }
    readonly property bool drifting: !!activeTake && !!activeTake.musicGeneration && !!activeTake.musicGeneration.alignment
        && activeTake.musicGeneration.alignment.drifting === true

    function stateText(state) {
        switch (state) {
        case "rendering": return qsTr("Rendering context")
        case "queued": return qsTr("Queued")
        case "running": return qsTr("Running")
        case "placing": return qsTr("Placing")
        case "failed": return qsTr("Failed · see the job list")
        default: return ""
        }
    }

    component Hatch: Item {
        id: hatch
        clip: true
        readonly property real step: Ui.Metrics.md
        Rectangle {
            anchors.fill: parent
            color: Ui.Theme.actionSelected
        }
        Repeater {
            model: hatch.visible ? Math.ceil((hatch.width + hatch.height) / hatch.step) : 0
            delegate: Rectangle {
                required property int index
                x: index * hatch.step - hatch.height
                y: hatch.height / 2 - height / 2
                width: Ui.Metrics.border
                height: hatch.height * Math.SQRT2
                rotation: 45
                transformOrigin: Item.Center
                color: TimelineVisuals.clipText
                opacity: 0.35
            }
        }
    }

    // The placeholder: hatched, its job and its state (GN-7).
    Hatch {
        objectName: "musicPlaceholder-" + root.clip.id
        visible: root.placeholder
        anchors.fill: parent
        anchors.topMargin: Ui.Metrics.xl
    }
    Column {
        visible: root.placeholder
        x: Ui.Metrics.sm
        y: Ui.Metrics.xl + Ui.Metrics.xs
        width: parent.width - 2 * Ui.Metrics.sm
        Ui.Text {
            width: parent.width
            text: root.job ? root.job.title : qsTr("Generate")
            elide: Text.ElideRight
            role: Ui.Typography.SansCaption
            domainColor: TimelineVisuals.clipText
        }
        Ui.Text {
            objectName: "musicPlaceholderState-" + root.clip.id
            width: parent.width
            text: root.job ? root.stateText(root.job.state) : qsTr("Result undone · redo to restore")
            elide: Text.ElideRight
            role: Ui.Typography.MonoCaption
            domainColor: TimelineVisuals.clipText
        }
    }

    // The active take and its drift badge, under the name band.
    Row {
        objectName: "musicTakeHeader-" + root.clip.id
        visible: !root.placeholder && !!root.activeTake && !!root.activeTake.musicGeneration
        x: Ui.Metrics.xs
        y: Ui.Metrics.xl
        spacing: Ui.Metrics.xs
        Ui.Text {
            text: root.activeTake ? root.activeTake.label || "" : ""
            role: Ui.Typography.SansCaption
            domainColor: TimelineVisuals.clipText
        }
        Rectangle {
            objectName: "musicDrift-" + root.clip.id
            visible: root.drifting
            width: driftLabel.implicitWidth + 2 * Ui.Metrics.xs
            height: driftLabel.implicitHeight
            radius: Ui.Metrics.radiusControl
            color: Ui.Theme.statusWarningSurface
            Accessible.role: Accessible.StaticText
            Accessible.name: qsTr("The active take drifts off the grid")
            Ui.Text {
                id: driftLabel
                anchors.centerIn: parent
                text: qsTr("drift")
                role: Ui.Typography.MonoCaption
                domainColor: Ui.Theme.statusWarningOnSurface
            }
        }
    }

    // A running Regenerate: the bars being replaced (section 9.2).
    Repeater {
        model: root.bands
        delegate: Hatch {
            id: band
            required property var modelData
            readonly property double startMs: modelData.startFrame / 48
            readonly property double endMs: modelData.endFrame / 48
            objectName: "musicBand-" + modelData.jobId
            x: root.clip.durationMs > 0 ? (startMs - root.clip.startMs) / root.clip.durationMs * root.width : 0
            width: root.clip.durationMs > 0 ? (endMs - startMs) / root.clip.durationMs * root.width : 0
            y: Ui.Metrics.xl
            height: root.height - y
            Rectangle {
                x: Ui.Metrics.xs
                y: Ui.Metrics.xs
                width: bandLabel.implicitWidth + 2 * Ui.Metrics.xs
                height: bandLabel.implicitHeight
                radius: Ui.Metrics.radiusControl
                color: Ui.Theme.surfaceOverlay
                Ui.Text {
                    id: bandLabel
                    objectName: "musicBandLabel"
                    anchors.centerIn: parent
                    text: band.modelData.state === "running" ? qsTr("Repainting %1").arg(band.modelData.bars) : root.stateText(band.modelData.state)
                    role: Ui.Typography.MonoCaption
                    tone: Ui.Text.Primary
                }
            }
        }
    }
}
