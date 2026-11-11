// Behaviour ported from FilmCraft (MIT), see licenses/FilmCraft-MIT.txt.
// The Program monitor's comparison view: the reference on the left, the live current frame on the
// right, at the same zoom and pan. The reference is a still, so this view adds no decoder.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: view
    objectName: "comparisonView"
    required property var timeline
    required property var clock
    property var gestures: null
    required property var monitor
    readonly property bool keepsPicture: true
    readonly property rect pictureArea: Qt.rect(Math.ceil(width / 2), 0, Math.floor(width / 2), Math.max(0, height - bar.height))
    property var controller: null
    readonly property bool shown: visible && controller !== null
    function controllerAbove() {
        for (let item = parent; item; item = item.parent) {
            if (item.referenceMonitor !== undefined) return item.referenceMonitor
        }
        return null
    }
    onParentChanged: controller = controllerAbove()
    Component.onCompleted: controller = controllerAbove()
    onShownChanged: if (controller) controller.shownInView = shown
    onControllerChanged: if (controller) controller.shownInView = shown
    Component.onDestruction: if (controller) controller.shownInView = false

    Rectangle {
        id: referenceArea
        objectName: "comparisonReferenceArea"
        width: view.pictureArea.x
        height: view.pictureArea.height
        color: Ui.Theme.surfaceCanvas
        clip: true
        FrameImage {
            id: referenceImage
            objectName: "comparisonReferenceImage"
            x: view.monitor.pictureRect.x
            y: view.monitor.pictureRect.y
            width: view.monitor.pictureRect.width
            height: view.monitor.pictureRect.height
            Binding on image {
                when: view.controller !== null
                value: view.controller ? view.controller.image : null
            }
            Accessible.role: Accessible.Graphic
            Accessible.name: "Reference frame"
        }
        Ui.Text {
            objectName: "comparisonMessage"
            anchors.centerIn: parent
            width: parent.width - Ui.Metrics.xl * 2
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.WordWrap
            visible: text !== ""
            text: {
                if (!view.controller) return ""
                if (view.controller.error !== "") return view.controller.error
                if (view.controller.hasImage) return ""
                if (!view.controller.hasContent) return "Add a clip to the timeline to compare frames."
                return view.controller.busy ? "Loading the reference frame…" : ""
            }
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
        }
    }
    Rectangle {
        x: view.pictureArea.x - 1
        width: 1
        height: view.pictureArea.height
        color: Ui.Theme.borderSubtle
    }
    Rectangle {
        id: bar
        y: view.height - height
        width: view.width
        height: TimelineMetrics.transportHeight
        color: Ui.Theme.surfacePanel
        Row {
            id: controls
            objectName: "comparisonControls"
            x: Ui.Metrics.xs
            anchors.verticalCenter: parent.verticalCenter
            spacing: Ui.Metrics.micro
            Ui.Text {
                anchors.verticalCenter: parent.verticalCenter
                text: "Reference"
                role: Ui.Typography.SansLabel
                tone: Ui.Text.Secondary
            }
            TimecodeField {
                objectName: "comparisonTimecode"
                anchors.verticalCenter: parent.verticalCenter
                timeMs: view.controller ? Math.max(0, view.controller.timeMs) : 0
                fps: view.timeline.fps
                dropFrame: view.timeline.dropFrame
                maxMs: view.timeline.contentEndMs
                accessibleName: "Reference timecode"
                onSeekRequested: ms => view.controller.parkAt(ms)
            }
            Ui.ToolbarIconButton {
                objectName: "comparisonStepBack"
                iconName: "navigateBefore"
                accessibleName: "Reference back one frame"
                enabled: view.controller !== null && view.controller.hasContent
                onClicked: view.controller.stepFrames(-1)
            }
            Ui.ToolbarIconButton {
                objectName: "comparisonStepForward"
                iconName: "navigateNext"
                accessibleName: "Reference forward one frame"
                enabled: view.controller !== null && view.controller.hasContent
                onClicked: view.controller.stepFrames(1)
            }
            Ui.EditorButton {
                objectName: "comparisonMatchPlayhead"
                text: "Match playhead"
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                enabled: view.controller !== null && view.controller.hasContent
                onClicked: view.controller.matchPlayhead()
            }
            Ui.EditorButton {
                objectName: "comparisonRefresh"
                visible: view.controller !== null && (view.controller.stale || view.controller.error !== "")
                text: "Refresh"
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                onClicked: view.controller.refresh()
            }
        }
        Ui.Text {
            objectName: "comparisonStatus"
            anchors.left: controls.right
            anchors.right: currentLabel.left
            anchors.leftMargin: Ui.Metrics.md
            anchors.rightMargin: Ui.Metrics.md
            anchors.verticalCenter: parent.verticalCenter
            elide: Text.ElideRight
            text: {
                if (!view.controller) return ""
                if (view.controller.stale) return "The timeline changed after this frame was captured."
                return view.controller.description
            }
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
        }
        Ui.Text {
            id: currentLabel
            // A narrow monitor keeps the controls, which do the work.
            visible: bar.width > controls.width + implicitWidth + Ui.Metrics.md * 3
            anchors.right: parent.right
            anchors.rightMargin: Ui.Metrics.md
            anchors.verticalCenter: parent.verticalCenter
            text: "Current frame"
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
        }
    }
}
