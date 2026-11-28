// nt-panel: slot=clipBody id=clipFadeGrips order=10 title="Fade grips"
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

FocusScope {
    id: root
    required property ClipBody body
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    readonly property real msPerPx: viewState ? viewState.msPerPx : 10
    readonly property bool selected: body.selected
    readonly property bool locked: body.locked
    property bool heldFocus: false
    onActiveFocusChanged: {
        if (activeFocus || visible) { heldFocus = activeFocus }
        if (body) { body.detailFocusActive = activeFocus }
    }
    function fadeMs(edge: string, start: real, delta: real): real {
        const other = edge === "in" ? body.fadeOutMs : body.fadeInMs
        return Math.min(Math.max(0, body.durationMs - Math.max(0, other)), Math.max(0, start + delta * (edge === "in" ? 1 : -1)))
    }
    function finishFade(): void {
        edits.finishFade()
        if (body) { body.detailGestureActive = false }
    }
    Component.onDestruction: {
        finishFade()
        if (body) {
            body.detailFocusActive = false
            body.detailMenuActive = false
        }
        if ((activeFocus || heldFocus) && gestures) { gestures.forceActiveFocus() }
    }
    ClipAudio { id: edits; timeline: root.timeline }
    Loader {
        id: shapeMenu
        active: false
        onActiveChanged: if (root.body) { root.body.detailMenuActive = active }
        sourceComponent: ClipFadeShapeMenu {
            objectName: "clipFadeShapeMenu-" + root.body.clipId
            parent: root
            timeline: root.timeline
            clipId: root.body.clipId || ""
            onClosed: shapeMenu.active = false
            current: edge === "in" ? root.body.fadeInShape : root.body.fadeOutShape
        }
    }
    Repeater {
        model: root.body.showFades && root.width >= 32 ? 2 : 0
        delegate: Item {
            id: grip
            required property int index
            readonly property string edge: index === 0 ? "in" : "out"
            readonly property real lengthMs: (edge === "in" ? root.body.fadeInMs : root.body.fadeOutMs) || 0
            readonly property real offsetPx: Math.min(lengthMs / root.msPerPx, root.width)
            readonly property real centerX: root.body.fadeGripCenter(edge)
            objectName: "fadeGrip-" + edge + "-" + root.body.clipId
            x: centerX - width / 2
            y: 0
            width: root.body.fadeGripSize
            height: root.body.fadeGripSize
            activeFocusOnTab: true
            Accessible.role: Accessible.Slider
            Accessible.name: (edge === "in" ? "Fade in " : "Fade out ") + Number(lengthMs / 1000).toFixed(2) + " seconds"
            Rectangle {
                anchors.fill: parent
                radius: width / 2
                color: pointer.containsMouse || grip.activeFocus ? Ui.Theme.accentPrimary : Ui.Theme.textPrimary
                border.width: Ui.Metrics.border
                border.color: Ui.Theme.surfacePanel
                opacity: root.selected || (root.body && root.body.hovered) || pointer.containsMouse || grip.activeFocus ? 1 : 0
            }
            Keys.onTabPressed: event => {
                const region = root.gestures ? root.gestures.parent as TracksRegion : null
                event.accepted = !!region && region.focusNextClipDetail(grip, true)
            }
            Keys.onBacktabPressed: event => {
                const region = root.gestures ? root.gestures.parent as TracksRegion : null
                event.accepted = !!region && region.focusNextClipDetail(grip, false)
            }
            Timer { id: keyEnd; interval: 400; onTriggered: root.finishFade() }
            Keys.onPressed: event => {
                event.accepted = false
                if (root.locked || (event.key !== Qt.Key_Left && event.key !== Qt.Key_Right)) return
                event.accepted = true
                if (!keyEnd.running) {
                    if (root.body) { root.body.detailGestureActive = true }
                    edits.beginFade(root.body.clipId, edge)
                }
                edits.previewFade(root.fadeMs(grip.edge, grip.lengthMs, (event.key === Qt.Key_Right ? 1 : -1) * (event.modifiers & Qt.ShiftModifier ? 10 : 100)))
                keyEnd.restart()
            }
            onActiveFocusChanged: if (!activeFocus && keyEnd.running) { keyEnd.stop(); root.finishFade() }
            MouseArea {
                id: pointer
                objectName: "fadePointer-" + grip.edge + "-" + root.body.clipId
                property bool playheadPassthrough: true
                property bool takesTrimPress: true
                property real startX: 0
                property real startMs: 0
                property string ownerClipId: ""
                anchors.fill: parent
                anchors.margins: -root.body.fadeGripMargin
                acceptedButtons: Qt.LeftButton | Qt.RightButton
                hoverEnabled: true
                preventStealing: true
                cursorShape: root.locked ? Qt.ForbiddenCursor : Qt.SizeHorCursor
                function beginForwardedFade(sceneX: real): void {
                    keyEnd.stop()
                    edits.finishFade()
                    if (root.gestures) { root.gestures.forceActiveFocus(Qt.MouseFocusReason) }
                    ownerClipId = root.body.clipId
                    startX = sceneX
                    startMs = grip.lengthMs
                    root.body.detailGestureActive = true
                    edits.beginFade(ownerClipId, grip.edge)
                }
                function previewForwardedFade(sceneX: real): void {
                    if (root.locked || ownerClipId !== root.body.clipId) { return }
                    edits.previewFade(Math.round(root.fadeMs(grip.edge, startMs, (sceneX - startX) * root.msPerPx)))
                }
                function finishForwardedFade(): void {
                    ownerClipId = ""
                    root.finishFade()
                }
                onPressed: function(mouse: MouseEvent): void {
                    if (root.locked) return
                    keyEnd.stop()
                    edits.finishFade()
                    if (root.gestures) root.gestures.forceActiveFocus(Qt.MouseFocusReason)
                    if (mouse.button === Qt.RightButton) {
                        shapeMenu.active = true
                        const menu = shapeMenu.item as ClipFadeShapeMenu
                        if (!menu) { return }
                        menu.edge = grip.edge
                        const point = mapToItem(root, mouse.x, mouse.y)
                        menu.popup(point.x, point.y)
                        return
                    }
                    beginForwardedFade(mapToItem(null, mouse.x, mouse.y).x)
                }
                onPositionChanged: function(mouse: MouseEvent): void {
                    if (!pressed || pressedButtons !== Qt.LeftButton || root.locked || ownerClipId !== root.body.clipId) return
                    previewForwardedFade(mapToItem(null, mouse.x, mouse.y).x)
                }
                onReleased: finishForwardedFade()
                onCanceled: finishForwardedFade()
            }
        }
    }
}
