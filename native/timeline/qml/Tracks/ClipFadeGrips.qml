// nt-panel: slot=clipBody id=clipFadeGrips order=10 title="Fade grips"
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "../Inspector/AudioFadeShapes.js" as Fades

Item {
    id: root
    property var clip: ({})
    property var timeline: null
    property var gestures: null
    property var viewState: null
    readonly property real msPerPx: viewState ? viewState.msPerPx : 10
    readonly property bool selected: gestures && gestures.selection.indexOf(clip.id) >= 0
    readonly property bool locked: !!clip.locked || !!(body && body.locked)
    readonly property var body: {
        let item = parent
        while (item) {
            if (item.hovered !== undefined && item.selected !== undefined && item.locked !== undefined) return item
            item = item.parent
        }
        return null
    }
    ClipAudio { id: edits; timeline: root.timeline }
    Loader {
        id: shapeMenu
        active: false
        sourceComponent: ClipFadeShapeMenu {
            objectName: "clipFadeShapeMenu-" + root.clip.id
            parent: root
            timeline: root.timeline
            clipId: root.clip.id || ""
            current: Fades.parseClipFadeShape(edge === "in" ? root.clip.fadeInShape : root.clip.fadeOutShape)
        }
    }
    Repeater {
        model: ["audio", "video", "midi"].indexOf(root.clip.mediaType) >= 0 && root.width >= 32 ? ["in", "out"] : []
        delegate: Item {
            id: grip
            required property string modelData
            readonly property string edge: modelData
            readonly property real lengthMs: (edge === "in" ? root.clip.fadeInMs : root.clip.fadeOutMs) || 0
            readonly property real offsetPx: Math.min(lengthMs / root.msPerPx, root.width)
            readonly property real centerX: Math.min(Math.max(edge === "in" ? offsetPx : root.width - offsetPx, 4.5), root.width - 4.5)
            objectName: "fadeGrip-" + edge + "-" + root.clip.id
            x: centerX - width / 2
            y: 0
            width: 9
            height: 9
            activeFocusOnTab: true
            Accessible.role: Accessible.Slider
            Accessible.name: (edge === "in" ? "Fade in " : "Fade out ") + (lengthMs / 1000).toFixed(2) + " seconds"
            Rectangle {
                anchors.fill: parent
                radius: width / 2
                color: pointer.containsMouse || grip.activeFocus ? Theme.primary : Theme.textPrimary
                border.width: 1
                border.color: Theme.backgroundPaper
                opacity: root.selected || (root.body && root.body.hovered) || pointer.containsMouse || grip.activeFocus ? 1 : 0
            }
            Timer { id: keyEnd; interval: 400; onTriggered: edits.finishFade() }
            Keys.onPressed: event => {
                event.accepted = false
                if (root.locked || (event.key !== Qt.Key_Left && event.key !== Qt.Key_Right)) return
                event.accepted = true
                if (!keyEnd.running) edits.beginFade(root.clip.id, edge)
                edits.previewFade(Fades.keyFadeMs(root.clip, edge, event.key === Qt.Key_Left ? "ArrowLeft" : "ArrowRight", !!(event.modifiers & Qt.ShiftModifier)))
                keyEnd.restart()
            }
            onActiveFocusChanged: if (!activeFocus && keyEnd.running) { keyEnd.stop(); edits.finishFade() }
            MouseArea {
                id: pointer
                objectName: "fadePointer-" + grip.edge + "-" + root.clip.id
                property bool playheadPassthrough: true
                property bool takesTrimPress: true
                property real startX: 0
                property real startMs: 0
                anchors.fill: parent
                anchors.margins: -6
                acceptedButtons: Qt.LeftButton | Qt.RightButton
                hoverEnabled: true
                preventStealing: true
                cursorShape: root.locked ? Qt.ForbiddenCursor : Qt.SizeHorCursor
                onPressed: mouse => {
                    if (root.locked) return
                    keyEnd.stop()
                    edits.finishFade()
                    if (root.gestures) root.gestures.forceActiveFocus(Qt.MouseFocusReason)
                    if (mouse.button === Qt.RightButton) {
                        shapeMenu.active = true
                        shapeMenu.item.edge = grip.edge
                        const point = mapToItem(root, mouse.x, mouse.y)
                        shapeMenu.item.popup(point.x, point.y)
                        return
                    }
                    startX = mapToItem(null, mouse.x, mouse.y).x
                    startMs = grip.lengthMs
                    edits.beginFade(root.clip.id, grip.edge)
                }
                onPositionChanged: mouse => {
                    if (!pressed || pressedButtons !== Qt.LeftButton || root.locked) return
                    const dx = mapToItem(null, mouse.x, mouse.y).x - startX
                    edits.previewFade(Fades.dragFadeMs(root.clip, grip.edge, startMs, dx, root.msPerPx))
                }
                onReleased: edits.finishFade()
                onCanceled: edits.finishFade()
            }
        }
    }
}
