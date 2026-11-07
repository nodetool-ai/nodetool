// nt-panel: slot=bottom id=source order=10 title="Source"
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import "../src/edit/inspectorsections" as Sections
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    objectName: "sourceViewer"
    implicitWidth: TimelineMetrics.sourceViewerPreferredWidth
    implicitHeight: content.implicitHeight + Ui.Metrics.md * 2
    color: Ui.Theme.surfaceCanvas
    border.width: sourceFocused ? Ui.Metrics.focus : 0
    border.color: Ui.Theme.borderFocus
    activeFocusOnTab: true
    Accessible.role: Accessible.Pane
    Accessible.name: "Source monitor"

    property var editor: null
    property var gestures: null
    property var sourceGrid: null
    property real playerTimeMs: 0
    readonly property var asset: SourceViewerState.asset
    readonly property string mediaType: SourceViewerState.mediaType
    readonly property SourceMonitor monitor: SourceViewerState.monitor
    readonly property bool timed: mediaType === "video" || mediaType === "audio"
    readonly property bool canMark: mediaType === "video" || (mediaType === "audio" && monitor.ready)
    readonly property real timeMs: monitor.ready && timed ? monitor.clock.time : playerTimeMs
    readonly property real durationMs: monitor.ready && monitor.durationMs > 0 ? monitor.durationMs : SourceViewerState.durationMs
    readonly property real frameRate: monitor.frameRate
    readonly property bool sourceFocused: {
        let item = Window.activeFocusItem
        while (item) {
            if (item === root) return true
            item = item.parent
        }
        return false
    }
    // The probed rate once the source is open, else the asset's own when it reports one. Most assets do not, and
    // finding it means downloading the original.
    readonly property real sourceFrameRate: monitor.ready ? monitor.frameRate : asset.fps > 0 ? asset.fps : asset.frame_rate > 0 ? asset.frame_rate : 0
    readonly property real sequenceFrameRate: editor && editor.timeline ? editor.timeline.fps : 30
    readonly property var selectedAsset: {
        if (!sourceGrid || !sourceGrid.browser || !sourceGrid.selectedId) return null
        const assets = sourceGrid.browser.assets || []
        for (let i = 0; i < assets.length; ++i) {
            if (assets[i] && assets[i].id === sourceGrid.selectedId) return assets[i]
        }
        return null
    }
    Binding {
        target: SourceViewerState
        property: "mediaBrowser"
        value: root.sourceGrid && root.sourceGrid.browser &&
               typeof root.sourceGrid.browser.resolveClipMedia === "function" ? root.sourceGrid.browser : null
    }
    Binding {
        target: root.monitor
        property: "programClock"
        value: root.editor && root.editor.clock ? root.editor.clock : null
    }
    onSelectedAssetChanged: SourceViewerState.asset = selectedAsset || ({})
    property string playerAssetId: ""
    property string openedAssetId: ""
    onAssetChanged: {
        const id = asset.id || ""
        if (id !== playerAssetId) { playerTimeMs = SourceViewerState.cueMs; playerAssetId = id }
        syncMedia()
    }
    onVisibleChanged: syncMedia()
    Connections {
        target: SourceViewerState
        function onCued() {
            root.playerTimeMs = SourceViewerState.cueMs
            root.playerAssetId = root.asset.id || ""
            if (root.monitor.ready) root.monitor.seek(SourceViewerState.cueMs)
            else root.syncMedia()
        }
    }
    // Media loads only while the panel shows, and a hidden monitor does not play.
    function syncMedia() {
        if (!visible) {
            monitor.pause()
            return
        }
        const id = asset.id || ""
        if (!id || !mediaType) {
            openedAssetId = ""
            return
        }
        if (id === openedAssetId && (monitor.ready || monitor.busy || monitor.error !== "")) return
        openedAssetId = id
        monitor.open(asset, SourceViewerState.cueMs)
    }
    Component.onDestruction: monitor.pause()
    FrameAnimation {
        running: root.visible && root.monitor.clock.playing
        onTriggered: root.monitor.clock.tick()
    }

    // Keep editor, gesture and Library discovery together for the dock replacement.
    function attach() {
        let above = parent
        while (above && (above.timeline === undefined || above.clock === undefined)) above = above.parent
        editor = above
        gestures = null
        sourceGrid = null
        let fallbackGrid = null
        function visit(item, inLibrary) {
            if (!item) return
            const library = inLibrary || item.objectName === "assetExplorer"
            if (!gestures && item.gestures !== undefined) gestures = item.gestures
            if (library && item.selectedId !== undefined && item.browser !== undefined) {
                if (!fallbackGrid) fallbackGrid = item
                if (!sourceGrid && item.selectedId) sourceGrid = item
            }
            const children = item.children || []
            for (let i = 0; i < children.length; ++i) visit(children[i], library)
        }
        visit(editor, false)
        if (!sourceGrid) sourceGrid = fallbackGrid
        syncMedia()
    }
    Component.onCompleted: Qt.callLater(attach)
    onParentChanged: Qt.callLater(attach)

    function posterUrl() {
        if (mediaType === "image" && monitor.ready) return monitor.mediaUrl
        let path = asset.thumb_url || (mediaType === "image" ? asset.get_url || "" : "")
        if (sourceGrid && sourceGrid.browser && typeof sourceGrid.browser.mediaUrl === "function")
            return sourceGrid.browser.mediaUrl(path)
        return path
    }
    function mark(edge) {
        if (!canMark) return
        if (edge === "in") SourceViewerState.markIn(timeMs)
        else SourceViewerState.markOut(timeMs)
    }
    function scrubTo(ms) {
        if (monitor.ready) monitor.seek(ms)
        else playerTimeMs = Math.round(ms)
    }
    function cancelGesture() {
        if (SourceViewerState.rangeDragging) {
            SourceViewerState.cancelRangeDrag()
            return true
        }
        if (scrubBar.scrubbing) {
            scrubBar.cancelScrub()
            return true
        }
        return picture.cancelGesture() || [dragVideo, dragAudio, dragBoth].some(area => area && area.cancelGesture())
    }
    // Keys that act on Source while it has focus. Anything else goes on to the Program keys.
    function actionForKey(event) {
        const plain = event.modifiers === Qt.NoModifier
        const shift = event.modifiers === Qt.ShiftModifier
        if (event.key === Qt.Key_Space && plain) return "playPause"
        if ((event.key === Qt.Key_Left || event.key === Qt.Key_Right) && (plain || shift)) {
            return (shift ? "stepFrames" : "stepFrame") + (event.key === Qt.Key_Left ? "Back" : "Forward")
        }
        return gestures ? gestures.resolveKeyAction(event.key, event.text, event.modifiers) : ""
    }
    Keys.onPressed: event => {
        if (event.key === Qt.Key_Escape) {
            if (cancelGesture()) event.accepted = true
            return
        }
        const action = actionForKey(event)
        if (action === "markIn" || action === "markOut") {
            if (!canMark) return
            mark(action === "markIn" ? "in" : "out")
            event.accepted = true
        } else if (action !== "" && SourceViewerState.runAction(action, event.isAutoRepeat)) {
            event.accepted = true
        }
    }
    // Most of the editor takes no focus on a press, so a press decides who gets
    // the keys: Source for a press inside it, the editor for one outside.
    Item {
        parent: root.Window.contentItem
        anchors.fill: parent
        z: Ui.Metrics.layerOverlay
        PointHandler {
            onActiveChanged: {
                if (!active || !root.visible) return
                const p = root.mapFromItem(null, point.scenePosition.x, point.scenePosition.y)
                if (root.contains(p)) root.forceActiveFocus()
                else if (root.sourceFocused && root.editor) root.editor.forceActiveFocus()
            }
        }
    }

    Ui.Text {
        objectName: "sourceEmptyState"
        anchors.centerIn: parent
        width: parent.width - Ui.Metrics.lg * 2
        visible: !root.asset.id
        text: "Select an asset in the library to view it here"
        wrapMode: Text.WordWrap
        horizontalAlignment: Text.AlignHCenter
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Secondary
    }
    Flickable {
        id: scroller
        anchors.fill: parent
        contentHeight: content.implicitHeight + Ui.Metrics.md * 2
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: Ui.ScrollBar {}
        Column {
            id: content
            x: Ui.Metrics.md
            y: Ui.Metrics.md
            width: parent.width - Ui.Metrics.md * 2
            spacing: Ui.Metrics.sm
            Ui.Text {
                id: sourceName
                objectName: "sourceName"
                width: parent.width
                visible: !!root.asset.id
                text: root.asset.name || ""
                elide: Text.ElideRight
                role: Ui.Typography.SansLabel
                Ui.Tooltip { trigger: sourceName; visible: nameHover.hovered && sourceName.truncated; text: sourceName.text }
                HoverHandler { id: nameHover }
            }
            // The picture takes the room the controls leave, down to a usable minimum.
            Rectangle {
                id: stage
                objectName: "sourceStage"
                width: parent.width
                visible: !!root.asset.id
                height: !visible ? 0 : Math.max(Ui.Metrics.comfortable * 4,
                    scroller.height - Ui.Metrics.md * 2 - below.implicitHeight - sourceName.implicitHeight - content.spacing * 2)
                color: Ui.Theme.surfaceCanvas
                clip: true
                readonly property real aspect: root.monitor.frameSize.width > 0 && root.monitor.frameSize.height > 0
                    ? root.monitor.frameSize.width / root.monitor.frameSize.height : 16 / 9
                Image {
                    objectName: "sourcePoster"
                    anchors.fill: parent
                    visible: root.mediaType === "image" || (root.mediaType === "video" && !root.monitor.ready)
                    source: root.posterUrl()
                    asynchronous: true
                    fillMode: Image.PreserveAspectFit
                    Accessible.name: root.asset.name || ""
                }
                Loader {
                    active: root.visible && root.monitor.ready && root.mediaType === "video"
                    anchors.centerIn: parent
                    width: Math.min(stage.width, stage.height * stage.aspect)
                    height: width / stage.aspect
                    sourceComponent: PreviewCompositor {
                        objectName: "sourceCompositor"
                        timeline: root.monitor.timeline
                        clock: root.monitor.clock
                    }
                }
                WaveformItem {
                    objectName: "sourceWaveform"
                    anchors.fill: parent
                    visible: root.mediaType === "audio" && root.monitor.ready
                    source: visible ? root.monitor.audioPath : ""
                    outPointMs: root.durationMs
                    color: Ui.Theme.statusSuccess
                }
                Rectangle {
                    visible: root.mediaType === "audio" && root.monitor.ready
                    x: root.durationMs > 0 ? root.timeMs / root.durationMs * stage.width : 0
                    width: Ui.Metrics.micro
                    height: stage.height
                    color: Ui.Theme.textPrimary
                }
                Column {
                    anchors.centerIn: parent
                    width: parent.width - Ui.Metrics.lg * 2
                    spacing: Ui.Metrics.sm
                    visible: root.monitor.busy || !root.mediaType
                    Ui.BusyIndicator {
                        anchors.horizontalCenter: parent.horizontalCenter
                        visible: root.monitor.busy
                        running: visible
                        accessibleName: "Loading source media"
                    }
                    Ui.Text {
                        width: parent.width
                        visible: !root.mediaType
                        text: "This asset type cannot go on the timeline."
                        wrapMode: Text.WordWrap
                        horizontalAlignment: Text.AlignHCenter
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                }
                SourceDragArea {
                    id: picture
                    objectName: "sourcePicture"
                    anchors.fill: parent
                    enabled: !!root.mediaType && !root.monitor.busy
                    video: root.mediaType !== "audio"
                    audio: root.mediaType === "audio" || (root.mediaType === "video" && root.monitor.hasAudio)
                    horizontalScrub: root.mediaType === "audio"
                    property real baselineMs: 0
                    onPressed: baselineMs = root.timeMs
                    onScrubbed: x => root.scrubTo(x / Math.max(1, width) * root.durationMs)
                    onScrubCanceled: root.scrubTo(baselineMs)
                    onTapped: x => { if (root.mediaType === "audio") root.scrubTo(x / Math.max(1, width) * root.durationMs) }
                }
            }
            Column {
                id: below
                width: parent.width
                visible: !!root.asset.id
                spacing: Ui.Metrics.sm
                height: visible ? implicitHeight : 0
                SourceRangeBar {
                    id: scrubBar
                    objectName: "sourceScrub"
                    width: parent.width
                    visible: root.timed
                    durationMs: root.durationMs
                    timeMs: root.timeMs
                    inMs: SourceViewerState.inMs
                    outMs: SourceViewerState.outMs
                    onScrubbed: ms => root.scrubTo(ms)
                }
                Flow {
                    id: transport
                    objectName: "sourceTransport"
                    width: parent.width
                    spacing: Ui.Metrics.micro
                    visible: root.timed
                    Ui.ToolbarIconButton {
                        objectName: "sourceStepBack"
                        iconName: "navigateBefore"
                        accessibleName: "Previous frame"
                        description: "Previous frame"
                        enabled: root.monitor.ready
                        onClicked: root.monitor.stepFrames(-1)
                    }
                    Ui.ToolbarIconButton {
                        objectName: "sourcePlay"
                        iconName: root.monitor.clock.playing ? "pause" : "playArrow"
                        accessibleName: root.monitor.clock.playing ? "Pause source" : "Play source"
                        description: accessibleName
                        variant: Ui.EditorButton.Primary
                        enabled: root.monitor.ready
                        onClicked: root.monitor.togglePlay()
                    }
                    Ui.ToolbarIconButton {
                        objectName: "sourceStepForward"
                        iconName: "navigateNext"
                        accessibleName: "Next frame"
                        description: "Next frame"
                        enabled: root.monitor.ready
                        onClicked: root.monitor.stepFrames(1)
                    }
                    TimecodeField {
                        objectName: "sourceTimecode"
                        timeMs: root.timeMs
                        fps: root.sourceFrameRate > 0 ? root.sourceFrameRate : root.sequenceFrameRate
                        dropFrame: false
                        maxMs: root.durationMs
                        accessibleName: "Source timecode"
                        onSeekRequested: ms => {
                            if (root.monitor.ready) { root.monitor.seek(ms) } else { root.playerTimeMs = ms }
                        }
                    }
                    Ui.Text {
                        objectName: "sourceRateNote"
                        visible: root.sourceFrameRate <= 0
                        text: "Counted at the sequence's " + root.sequenceFrameRate + " fps"
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                    Sections.InspectorActionButton {
                        objectName: "sourceMarkIn"
                        visible: root.canMark
                        text: "Mark in"
                        outlined: false
                        shortcutText: "I"
                        onClicked: root.mark("in")
                    }
                    Sections.InspectorActionButton {
                        objectName: "sourceMarkOut"
                        visible: root.canMark
                        text: "Mark out"
                        outlined: false
                        shortcutText: "O"
                        onClicked: root.mark("out")
                    }
                    Sections.InspectorActionButton {
                        objectName: "sourceClearMarks"
                        visible: root.canMark
                        enabled: SourceViewerState.hasMarks
                        text: "Clear marks"
                        outlined: false
                        onClicked: SourceViewerState.clearMarks()
                    }
                    Ui.ToolbarIconButton {
                        objectName: "sourceExportFrame"
                        visible: root.mediaType === "video"
                        iconName: "photoCamera"
                        accessibleName: "Export frame"
                        description: "Export frame"
                        enabled: root.monitor.ready && root.gestures !== null
                        onClicked: root.gestures.runAction("exportFrame", {monitor: "source"})
                    }
                    Repeater {
                        model: [
                            { id: "sourceDragVideo", icon: "videocam", label: "Drag video only to a track", video: true, audio: false },
                            { id: "sourceDragAudio", icon: "audiotrack", label: "Drag audio only to a track", video: false, audio: true },
                            { id: "sourceDragBoth", icon: "movieOutlined", label: "Drag video and audio to a track", video: true, audio: true }
                        ]
                        delegate: Item {
                            id: dragIcon
                            required property var modelData
                            required property int index
                            objectName: modelData.id
                            width: Ui.Metrics.compact
                            height: Ui.Metrics.compact
                            enabled: (root.mediaType === "video" && (modelData.video !== modelData.audio ? (modelData.video || root.monitor.hasAudio) : root.monitor.hasAudio))
                                || (root.mediaType === "audio" && modelData.audio && !modelData.video)
                            opacity: enabled ? 1 : 0.4
                            Accessible.role: Accessible.Button
                            Accessible.name: modelData.label
                            Rectangle {
                                anchors.fill: parent
                                radius: Ui.Metrics.radiusControl
                                color: Ui.Theme.actionHover
                                visible: lift.containsMouse
                            }
                            Ui.Icon {
                                anchors.centerIn: parent
                                name: dragIcon.modelData.icon
                                size: Ui.Metrics.iconSm
                                tone: Ui.Text.Secondary
                            }
                            Ui.Tooltip {
                                trigger: dragIcon
                                visible: lift.containsMouse && !lift.lifting
                                text: dragIcon.modelData.label
                            }
                            SourceDragArea {
                                id: lift
                                anchors.fill: parent
                                hoverEnabled: true
                                video: dragIcon.modelData.video
                                audio: dragIcon.modelData.audio
                                Component.onCompleted: {
                                    if (dragIcon.modelData.video && dragIcon.modelData.audio) root.dragBoth = lift
                                    else if (dragIcon.modelData.video) root.dragVideo = lift
                                    else root.dragAudio = lift
                                }
                            }
                        }
                    }
                }
                Flow {
                    width: parent.width
                    spacing: Ui.Metrics.sm
                    visible: root.timed
                    InspectorRow {
                        width: Math.max(Ui.Metrics.comfortable * 3, (parent.width - parent.spacing) / 2)
                        label: "In"
                        InspectorPillInput {
                            objectName: "sourceIn"
                            value: (SourceViewerState.inMs / 1000).toFixed(2)
                            unit: "s"
                            ariaLabel: "Source in point"
                            onCommit: raw => SourceViewerState.setIn(raw)
                        }
                    }
                    InspectorRow {
                        width: Math.max(Ui.Metrics.comfortable * 3, (parent.width - parent.spacing) / 2)
                        label: "Out"
                        InspectorPillInput {
                            objectName: "sourceOut"
                            value: (SourceViewerState.outMs / 1000).toFixed(2)
                            unit: "s"
                            ariaLabel: "Source out point"
                            onCommit: raw => SourceViewerState.setOut(raw)
                        }
                    }
                }
                Ui.Text {
                    objectName: "sourceRangeSummary"
                    width: parent.width
                    text: (root.timed ? "Range " + ((SourceViewerState.outMs - SourceViewerState.inMs) / 1000).toFixed(2) + " s. " : "")
                        + (SourceViewerState.patchedVideoTrackId || SourceViewerState.patchedAudioTrackId
                           ? "Insert and Overwrite land at the playhead on the patched tracks."
                           : "Insert and Overwrite land at the playhead on the first unlocked track that fits the media.")
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Ui.Text {
                    objectName: "sourceError"
                    width: parent.width
                    visible: text !== ""
                    text: SourceViewerState.lastError || root.monitor.error
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Error
                }
                Flow {
                    width: parent.width
                    spacing: Ui.Metrics.sm
                    Repeater {
                        model: ["Append", "Insert", "Overwrite"]
                        delegate: Sections.InspectorActionButton {
                            required property string modelData
                            objectName: "source" + modelData
                            text: modelData
                            iconName: modelData === "Append" ? "playlistAdd" : modelData === "Insert" ? "keyboardTab" : "flipToFront"
                            enabled: !!root.mediaType
                            shortcutText: SourceViewerState.shortcut(modelData.toLowerCase(), root.gestures ? root.gestures.keyboardPreset : "nodetool")
                            onClicked: SourceViewerState.perform(modelData.toLowerCase(), root.gestures)
                        }
                    }
                }
            }
        }
    }
    property var dragVideo: null
    property var dragAudio: null
    property var dragBoth: null
}
