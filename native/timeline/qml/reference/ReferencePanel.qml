// nt-panel: slot=bottom id=reference order=95 title="Reference"
// Behaviour ported from FilmCraft (MIT), see licenses/FilmCraft-MIT.txt.
// A second view of the sequence, parked on its own frame or ganged to the playhead, showing the
// picture or its scopes. The frame is a still, so the panel adds no decoder.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    objectName: "referencePanel"
    implicitWidth: 480
    implicitHeight: 280
    color: Ui.Theme.surfaceCanvas
    property var editor: null
    readonly property var controller: editor ? editor.referenceMonitor : null
    readonly property var timeline: editor ? editor.timeline : null
    readonly property bool canSet: controller !== null && controller.hasContent
    readonly property bool shown: visible && width > 0 && height > 0 && controller !== null
    function editorAbove() {
        for (let item = parent; item; item = item.parent) {
            if (item.referenceMonitor !== undefined) return item
        }
        return null
    }
    Component.onCompleted: Qt.callLater(() => editor = editorAbove())
    onParentChanged: Qt.callLater(() => editor = editorAbove())
    onShownChanged: if (controller) controller.shownInPanel = shown
    onControllerChanged: if (controller) controller.shownInPanel = shown
    Component.onDestruction: if (controller) controller.shownInPanel = false
    Binding {
        when: root.controller !== null
        target: root.controller
        property: "takeClipId"
        value: {
            const gestures = root.controller ? root.controller.owner : null
            return gestures && gestures.selection.length === 1 ? gestures.selection[0] : ""
        }
    }

    property string display: ClipEffectsUi.folds["reference.display"] === "scopes" ? "scopes" : "picture"
    readonly property var scopeKinds: [
        {id: "waveform", label: "Waveform"},
        {id: "parade", label: "Parade"},
        {id: "vectorscope", label: "Vectorscope"},
        {id: "histogram", label: "Histogram"}
    ]
    property var shownScopes: {
        const saved = ClipEffectsUi.folds["reference.scopes"]
        return Array.isArray(saved) && saved.length ? saved : ["waveform", "vectorscope"]
    }
    function toggleScope(id) {
        const next = scopeKinds.map(kind => kind.id).filter(item => item === id ? !shownScopes.includes(item) : shownScopes.includes(item))
        if (next.length === 0) return
        shownScopes = next
        ClipEffectsUi.setFold("reference.scopes", next)
    }
    function feedScopes() {
        if (controller && display === "scopes" && controller.hasImage) scopes.showFrame(controller.image, controller.imageTimeMs)
    }
    onDisplayChanged: feedScopes()
    Connections {
        target: root.controller
        function onImageChanged() { root.feedScopes() }
    }
    // Computes only from the frames fed to it: it has no capture and no clock.
    ScopesController {
        id: scopes
        objectName: "referenceScopes"
        scopes: root.shownScopes
    }

    Flow {
        id: toolbar
        objectName: "referenceToolbar"
        x: Ui.Metrics.md
        y: Ui.Metrics.xs
        width: parent.width - Ui.Metrics.md * 2
        spacing: Ui.Metrics.xs
        TimecodeField {
            objectName: "referenceTimecode"
            timeMs: root.controller ? Math.max(0, root.controller.timeMs) : 0
            fps: root.timeline ? root.timeline.fps : 30
            dropFrame: root.timeline ? root.timeline.dropFrame : false
            maxMs: root.timeline ? root.timeline.contentEndMs : 0
            accessibleName: "Reference timecode"
            onSeekRequested: ms => root.controller.parkAt(ms)
        }
        Ui.ToolbarIconButton {
            objectName: "referenceStepBack"
            iconName: "navigateBefore"
            accessibleName: "Step back one frame"
            enabled: root.canSet
            onClicked: root.controller.stepFrames(-1)
        }
        Ui.ToolbarIconButton {
            objectName: "referenceStepForward"
            iconName: "navigateNext"
            accessibleName: "Step forward one frame"
            enabled: root.canSet
            onClicked: root.controller.stepFrames(1)
        }
        Ui.EditorButton {
            objectName: "referenceMatchPlayhead"
            text: "Match playhead"
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            enabled: root.canSet
            onClicked: root.controller.matchPlayhead()
        }
        Ui.EditorButton {
            objectName: "referenceGang"
            text: "Gang to Program"
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            active: root.controller !== null && root.controller.ganged
            Accessible.checkable: true
            Accessible.checked: active
            enabled: root.canSet
            onClicked: root.controller.ganged = !root.controller.ganged
        }
        Ui.Select {
            objectName: "referenceDisplay"
            width: 120
            density: Ui.EditorButton.Compact
            accessibleName: "Reference display"
            options: [{label: "Picture", value: "picture"}, {label: "Scopes", value: "scopes"}]
            value: root.display
            onValueCommitted: next => {
                root.display = next
                ClipEffectsUi.setFold("reference.display", next)
            }
        }
        Ui.Select {
            objectName: "referenceTake"
            width: 180
            density: Ui.EditorButton.Compact
            accessibleName: "Take to compare"
            visible: root.controller !== null && root.controller.takes.length > 0
            options: root.controller ? [{label: "Timeline frame", value: ""}].concat(root.controller.takes) : []
            value: root.controller ? root.controller.takeId : ""
            onValueCommitted: next => {
                if (next === "") root.controller.parkAt(root.controller.timeMs)
                else root.controller.useTake(root.controller.takeClipId, next)
            }
        }
        Repeater {
            model: root.display === "scopes" ? root.scopeKinds : []
            delegate: Ui.EditorButton {
                required property var modelData
                objectName: "referenceScope_" + modelData.id
                text: modelData.label
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                active: root.shownScopes.includes(modelData.id)
                Accessible.checkable: true
                Accessible.checked: active
                onClicked: root.toggleScope(modelData.id)
            }
        }
    }
    Row {
        id: status
        objectName: "referenceStatus"
        x: Ui.Metrics.md
        anchors.top: toolbar.bottom
        anchors.topMargin: Ui.Metrics.micro
        width: parent.width - Ui.Metrics.md * 2
        height: visible ? implicitHeight : 0
        spacing: Ui.Metrics.xs
        visible: statusText.text !== "" || refresh.visible
        Ui.Text {
            id: statusText
            objectName: "referenceStatusText"
            anchors.verticalCenter: parent.verticalCenter
            width: Math.min(implicitWidth, status.width - (refresh.visible ? refresh.width + status.spacing : 0))
            elide: Text.ElideRight
            text: {
                const c = root.controller
                if (!c) return ""
                if (c.error !== "") return c.error
                if (c.stale) return "The timeline changed after this frame was captured."
                if (c.ganged) return "Following the playhead"
                return c.description
            }
            role: Ui.Typography.SansCaption
            tone: root.controller && root.controller.error !== "" ? Ui.Text.Error : Ui.Text.Secondary
        }
        Ui.EditorButton {
            id: refresh
            objectName: "referenceRefresh"
            anchors.verticalCenter: parent.verticalCenter
            visible: root.controller !== null && (root.controller.stale || root.controller.error !== "")
            text: "Refresh"
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            onClicked: root.controller.refresh()
        }
    }
    Rectangle {
        objectName: "referencePlate"
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: status.visible ? status.bottom : toolbar.bottom
        anchors.bottom: parent.bottom
        anchors.margins: Ui.Metrics.xs
        color: Ui.Theme.surfaceCanvas
        clip: true
        FrameImage {
            objectName: "referenceImage"
            anchors.fill: parent
            visible: root.display === "picture"
            Binding on image {
                when: root.controller !== null
                value: root.controller ? root.controller.image : null
            }
            Accessible.role: Accessible.Graphic
            Accessible.name: "Reference frame"
        }
        ScopeGrid {
            objectName: "referenceScopesGrid"
            anchors.fill: parent
            visible: root.display === "scopes" && root.controller !== null && root.controller.hasImage
            shown: root.shownScopes
            controller: scopes
        }
        Ui.Text {
            objectName: "referenceMessage"
            anchors.centerIn: parent
            width: parent.width - Ui.Metrics.xl * 2
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.WordWrap
            visible: text !== ""
            text: {
                const c = root.controller
                if (!c || c.hasImage || c.error !== "") return ""
                if (!c.hasContent) return "Add a clip to the timeline to set a reference frame."
                return c.busy ? "Loading the reference frame…" : ""
            }
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
        }
    }
}
