// Shared style edits for ClipTextStyleSection, ClipShapeSection and ClipCaptionStyle.
// Text prefix keeps this helper within package I's owns pattern.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline

QtObject {
    id: root
    property var timelineModel: null
    property var controller: null
    property string styleKey: "textStyle"
    readonly property var clip: controller ? controller.clip : ({})
    readonly property var style: styleKey === "caption" ? (clip.caption?.style || {}) : (clip[styleKey] || {})
    readonly property bool locked: !controller || controller.locked
    property var typingClip: null
    property var typingPayload: null
    readonly property bool typing: typingClip !== null
    property string observedId: ""
    property InspectorEdits edits: InspectorEdits {
        model: root.timelineModel
    }
    property Connections selection: Connections {
        target: root.controller
        function onChanged() {
            const next = root.controller ? root.controller.clipId : "";
            if (next !== root.observedId) {
                root.observedId = next;
                if (root.typing)
                    root.finishTyping();
                else
                    root.edits.cancelGesture();
            }
        }
    }
    Component.onDestruction: edits.cancelGesture()
    function payload(path, value, sourceClip = clip) {
        const sourceStyle = styleKey === "caption" ? (sourceClip.caption?.style || {}) : (sourceClip[styleKey] || {});
        const next = Object.assign({}, sourceStyle);
        const keys = path.split(".");
        let target = next;
        for (let i = 0; i < keys.length - 1; ++i) {
            target[keys[i]] = Object.assign({}, target[keys[i]]);
            target = target[keys[i]];
        }
        if (value === undefined)
            delete target[keys[keys.length - 1]];
        else
            target[keys[keys.length - 1]] = value;
        const patch = {};
        patch[styleKey] = styleKey === "caption" ? Object.assign({}, sourceClip.caption, {
            style: next
        }) : next;
        return {
            clipId: sourceClip.id,
            patch
        };
    }
    function beginTyping() {
        if (locked || !clip.id)
            return;
        begin();
        typingClip = JSON.parse(JSON.stringify(clip));
        typingPayload = payload("text", style.text, typingClip);
    }
    function previewTyping(value) {
        if (!typing || controller.clipId !== typingClip.id)
            return;
        typingPayload = payload("text", value, typingClip);
        edits.preview(typingPayload);
    }
    function finishTyping() {
        if (!typing)
            return;
        const pending = typingPayload;
        typingClip = null;
        typingPayload = null;
        edits.commit("patchClip", pending);
    }
    function begin() {
        if (!locked)
            edits.beginGesture("patchClip", {
                clipId: clip.id
            });
    }
    function set(path, value, preview = false) {
        if (locked || !clip.id) {
            edits.cancelGesture();
            return;
        }
        const p = payload(path, value);
        if (preview)
            edits.preview(p);
        else
            edits.commit("patchClip", p);
    }
}
