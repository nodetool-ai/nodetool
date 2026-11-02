// The Trim Monitor, a Program monitor view: the outgoing clip's last frame and the
// incoming clip's first frame, their timecodes, the Out and In shift counters, and
// the trim buttons. Dragging in a picture trims that side and dragging between
// them rolls. While Space loops around the edit it shows the live picture instead.
// FilmCraft's crates/ui-egui/src/panels/trim_monitor.rs is the layout reference
// (licenses/FilmCraft-MIT.txt).
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    objectName: "trimMonitor"
    required property TimelineModel timeline
    required property PlaybackClock clock
    property ClipGestureController gestures: null
    required property MonitorViewState monitor

    readonly property TrimMode trim: gestures ? gestures.trimMode : null
    readonly property bool active: trim !== null && trim.active
    readonly property var info: trim ? trim.monitor : ({})
    readonly property int largeFrames: trim ? trim.largeFrames : 0
    readonly property color markColor: trim && trim.kind === "ripple" ? TimelineVisuals.trimRipple : TimelineVisuals.trimRoll

    // The loop plays in the live picture, in the place of the two frames.
    readonly property bool keepsPicture: trim !== null && trim.looping
    readonly property rect pictureArea: Qt.rect(0, pictures.y, width, pictures.height)

    function editorCapture() {
        for (let item = root.parent; item; item = item.parent) {
            if (item.frameCapture !== undefined) return item.frameCapture
        }
        return null
    }
    function shiftText(frames) {
        const count = frames || 0
        return count > 0 ? "+" + count : String(count).replace("-", "−")
    }
    function timecodeOf(side) {
        return side ? TimelineFormat.timecode(side.frameTimeMs, root.timeline.fps, root.timeline.dropFrame) : "--:--:--:--"
    }
    function sideTitle(prefix, side) {
        return side ? prefix + ": " + side.name : prefix + ": Gap"
    }
    readonly property string dynamicText: {
        if (!trim || !trim.dynamicActive) return ""
        if (trim.atLimit) return "Stopped at a limit"
        const speed = trim.dynamicSpeed
        return (speed > 0 ? "Trimming forward " : "Trimming back ") + Math.abs(speed) + "×"
    }

    TrimMonitorFrames {
        id: frames
        objectName: "trimMonitorFrames"
        trim: root.trim
        capture: root.editorCapture()
        enabled: root.active && !root.keepsPicture
    }

    Ui.EmptyState {
        objectName: "trimMonitorEmpty"
        anchors.centerIn: parent
        visible: !root.active
        maxTextWidth: Math.min(root.width - Ui.Metrics.xxl, Ui.Metrics.dialogCompactWidth)
        title: "No edit point selected"
        message: "Click an edit point with the Ripple or Rolling tool, or press Shift+T at the nearest cut."
    }

    component SidePicture: Rectangle {
        id: side
        required property string sideName
        required property var sideInfo
        required property bool moves
        required property var image
        required property string errorText
        required property bool loading
        readonly property bool audioOnly: sideInfo !== null && sideInfo !== undefined && (sideInfo.mediaType === "audio" || sideInfo.mediaType === "midi")
        color: Ui.Theme.surfaceCanvas
        FrameImage {
            objectName: "trimMonitorImage-" + side.sideName
            anchors.fill: parent
            image: side.image
        }
        Ui.Text {
            anchors.centerIn: parent
            width: parent.width - Ui.Metrics.lg
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
            visible: text !== ""
            role: Ui.Typography.SansCaption
            tone: side.errorText !== "" ? Ui.Text.Error : Ui.Text.Secondary
            text: {
                if (side.errorText !== "") return side.errorText
                if (!side.sideInfo) return "Gap"
                if (side.loading) return "Loading frame"
                return side.audioOnly ? "Audio: " + side.sideInfo.name : ""
            }
        }
        Rectangle {
            objectName: "trimMonitorMoves-" + side.sideName
            anchors.fill: parent
            visible: side.moves
            color: "transparent"
            border.width: Ui.Metrics.focus
            border.color: root.markColor
        }
        MouseArea {
            objectName: "trimMonitorDrag-" + side.sideName
            anchors.fill: parent
            enabled: side.sideInfo !== null && side.sideInfo !== undefined
            hoverEnabled: true
            cursorShape: Qt.SizeHorCursor
            property real startX: 0
            onPressed: mouse => {
                startX = mouse.x
                root.trim.beginDrag(side.sideName)
            }
            onPositionChanged: mouse => {
                if (pressed) root.trim.dragFrames(Math.round((mouse.x - startX) / TimelineMetrics.trimMonitorPxPerFrame))
            }
            onReleased: root.trim.endDrag(true)
            onCanceled: root.trim.endDrag(false)
        }
    }

    Item {
        id: content
        anchors.fill: parent
        anchors.margins: Ui.Metrics.xs
        visible: root.active

        Item {
            id: titles
            width: parent.width
            height: outgoingTitle.implicitHeight
            Ui.Text {
                id: outgoingTitle
                objectName: "trimMonitorOutgoingTitle"
                width: (parent.width - TimelineMetrics.trimMonitorGap) / 2
                elide: Text.ElideRight
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                text: root.sideTitle("Out", root.info.outgoing)
            }
            Ui.Text {
                objectName: "trimMonitorIncomingTitle"
                x: parent.width - width
                width: outgoingTitle.width
                elide: Text.ElideRight
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                text: root.sideTitle("In", root.info.incoming)
            }
        }

        Item {
            id: pictures
            y: titles.height + Ui.Metrics.xs
            width: parent.width
            height: Math.max(0, counters.y - y - Ui.Metrics.xs)
            visible: !root.keepsPicture
            SidePicture {
                objectName: "trimMonitorOutgoing"
                width: (parent.width - TimelineMetrics.trimMonitorGap) / 2
                height: parent.height
                sideName: "outgoing"
                sideInfo: root.info.outgoing ?? null
                moves: root.info.outgoingMoves === true
                image: frames.outgoingImage
                errorText: frames.outgoingError
                loading: frames.outgoingLoading
            }
            MouseArea {
                objectName: "trimMonitorDrag-between"
                x: (parent.width - width) / 2
                width: TimelineMetrics.trimMonitorGap
                height: parent.height
                hoverEnabled: true
                cursorShape: Qt.SplitHCursor
                enabled: root.info.outgoing && root.info.incoming ? true : false
                property real startX: 0
                onPressed: mouse => {
                    startX = mouse.x
                    root.trim.beginDrag("between")
                }
                onPositionChanged: mouse => {
                    if (pressed) root.trim.dragFrames(Math.round((mouse.x - startX) / TimelineMetrics.trimMonitorPxPerFrame))
                }
                onReleased: root.trim.endDrag(true)
                onCanceled: root.trim.endDrag(false)
            }
            SidePicture {
                objectName: "trimMonitorIncoming"
                x: parent.width - width
                width: (parent.width - TimelineMetrics.trimMonitorGap) / 2
                height: parent.height
                sideName: "incoming"
                sideInfo: root.info.incoming ?? null
                moves: root.info.incomingMoves === true
                image: frames.incomingImage
                errorText: frames.incomingError
                loading: frames.incomingLoading
            }
        }

        Item {
            id: counters
            y: buttons.y - height - Ui.Metrics.xs
            width: parent.width
            height: outgoingTimecode.implicitHeight
            Ui.Text {
                id: outgoingTimecode
                objectName: "trimMonitorOutTimecode"
                role: Ui.Typography.MonoCaption
                text: root.timecodeOf(root.info.outgoing)
                Accessible.name: "Outgoing timecode " + text
            }
            Ui.Text {
                objectName: "trimMonitorOutShift"
                x: parent.width / 2 - width - TimelineMetrics.trimMonitorGap / 2
                role: Ui.Typography.MonoCaption
                tone: root.info.outgoingMoves === true ? Ui.Text.Primary : Ui.Text.Secondary
                text: root.shiftText(root.info.outShift)
                Accessible.name: "Out shift " + text + " frames"
            }
            Ui.Text {
                objectName: "trimMonitorInShift"
                x: parent.width / 2 + TimelineMetrics.trimMonitorGap / 2
                role: Ui.Typography.MonoCaption
                tone: root.info.incomingMoves === true ? Ui.Text.Primary : Ui.Text.Secondary
                text: root.shiftText(root.info.inShift)
                Accessible.name: "In shift " + text + " frames"
            }
            Ui.Text {
                objectName: "trimMonitorInTimecode"
                x: parent.width - width
                role: Ui.Typography.MonoCaption
                text: root.timecodeOf(root.info.incoming)
                Accessible.name: "Incoming timecode " + text
            }
        }

        Ui.Text {
            objectName: "trimMonitorDynamic"
            anchors.horizontalCenter: parent.horizontalCenter
            y: pictures.y + Ui.Metrics.xs
            visible: text !== ""
            role: Ui.Typography.SansCaption
            domainColor: root.markColor
            text: root.dynamicText
        }

        Item {
            id: buttons
            y: parent.height - height
            width: parent.width
            height: buttonRow.height
            // None of these buttons takes the focus on a click, so Space and the
            // trim keys go on reaching the editor.
            Ui.ToolbarIconButton {
                objectName: "trimMonitorLoop"
                focusPolicy: Qt.TabFocus
                iconName: root.trim && root.trim.looping ? "pause" : "repeat"
                active: root.trim !== null && root.trim.looping
                accessibleName: root.trim && root.trim.looping ? "Stop the loop" : "Loop around the edit"
                onClicked: root.trim.toggleLoop()
            }
            Row {
                id: buttonRow
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: Ui.Metrics.xs
                Repeater {
                    model: [{name: "BackwardMany", frames: -root.largeFrames, say: "Trim back " + root.largeFrames + " frames"},
                            {name: "Backward", frames: -1, say: "Trim back 1 frame"}]
                    delegate: Ui.EditorButton {
                        required property var modelData
                        objectName: "trimMonitor" + modelData.name
                        focusPolicy: Qt.TabFocus
                        density: Ui.EditorButton.Compact
                        text: "−" + Math.abs(modelData.frames)
                        accessibleName: modelData.say
                        onClicked: root.trim.nudge(modelData.frames)
                    }
                }
                Ui.EditorButton {
                    objectName: "trimMonitorApplyTransition"
                    focusPolicy: Qt.TabFocus
                    density: Ui.EditorButton.Compact
                    text: root.width >= Ui.Metrics.dialogCompactWidth ? "Apply default transition" : "Transition"
                    accessibleName: "Apply default transition"
                    onClicked: root.trim.applyDefaultTransition()
                }
                Repeater {
                    model: [{name: "Forward", frames: 1, say: "Trim forward 1 frame"},
                            {name: "ForwardMany", frames: root.largeFrames, say: "Trim forward " + root.largeFrames + " frames"}]
                    delegate: Ui.EditorButton {
                        required property var modelData
                        objectName: "trimMonitor" + modelData.name
                        focusPolicy: Qt.TabFocus
                        density: Ui.EditorButton.Compact
                        text: "+" + modelData.frames
                        accessibleName: modelData.say
                        onClicked: root.trim.nudge(modelData.frames)
                    }
                }
            }
            Ui.ToolbarIconButton {
                objectName: "trimMonitorExit"
                focusPolicy: Qt.TabFocus
                x: parent.width - width
                iconName: "close"
                accessibleName: "Exit trim mode"
                onClicked: root.trim.leave()
            }
        }
    }
}
