// nt-panel: slot=bottom id=scopes order=90 title="Scopes"
// Waveform, RGB parade, vectorscope and histogram of the graded frame at the playhead. The panel
// only asks for frames while it is shown.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    objectName: "scopesPanel"
    implicitWidth: 480
    implicitHeight: 280
    color: Ui.Theme.surfaceCanvas
    function editorAbove() {
        let item = parent;
        while (item) {
            if (item.timeline !== undefined && item.clock !== undefined)
                return item;
            item = item.parent;
        }
        return null;
    }
    property var editor: null
    Component.onCompleted: Qt.callLater(() => editor = editorAbove())
    onParentChanged: Qt.callLater(() => editor = editorAbove())
    readonly property var kinds: [
        {
            id: "waveform",
            label: "Waveform"
        },
        {
            id: "parade",
            label: "Parade"
        },
        {
            id: "vectorscope",
            label: "Vectorscope"
        },
        {
            id: "histogram",
            label: "Histogram"
        }
    ]
    property var shown: {
        const saved = ClipEffectsUi.folds["scopes.shown"];
        return Array.isArray(saved) && saved.length ? saved : kinds.map(kind => kind.id);
    }
    function toggle(id) {
        const next = kinds.map(kind => kind.id).filter(item => item === id ? !shown.includes(item) : shown.includes(item));
        if (next.length === 0)
            return;
        shown = next;
        ClipEffectsUi.setFold("scopes.shown", next);
    }
    ScopesController {
        id: scopes
        objectName: "scopesController"
        capture: root.editor ? root.editor.frameCapture : null
        clock: root.editor ? root.editor.clock : null
        active: root.visible && root.width > 0 && root.height > 0
        scopes: root.shown
    }
    Row {
        id: toolbar
        x: Ui.Metrics.md
        y: Ui.Metrics.xs
        spacing: Ui.Metrics.xs
        Repeater {
            model: root.kinds
            delegate: Ui.EditorButton {
                required property var modelData
                objectName: "scopesShow_" + modelData.id
                text: modelData.label
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                checkable: true
                checked: root.shown.includes(modelData.id)
                active: checked
                onClicked: root.toggle(modelData.id)
            }
        }
    }
    Ui.Text {
        objectName: "scopesError"
        anchors.left: toolbar.right
        anchors.right: parent.right
        anchors.leftMargin: Ui.Metrics.md
        anchors.rightMargin: Ui.Metrics.md
        anchors.verticalCenter: toolbar.verticalCenter
        visible: text !== ""
        text: scopes.error
        elide: Text.ElideRight
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Error
    }
    ScopeGrid {
        objectName: "scopesGrid"
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: toolbar.bottom
        anchors.bottom: parent.bottom
        anchors.margins: Ui.Metrics.xs
        shown: root.shown
        controller: scopes
    }
}
