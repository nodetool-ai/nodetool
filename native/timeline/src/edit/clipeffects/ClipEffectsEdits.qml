pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "ClipEffectsCatalog.js" as Catalog

QtObject {
    id: root
    property var timelineModel: null
    property var controller: null
    readonly property var clip: controller ? controller.clip : ({})
    readonly property var effects: clip.effects || []
    readonly property bool locked: !clip.id || !controller || controller.locked
    readonly property bool visual: !!clip.id && clip.mediaType !== "audio" && clip.mediaType !== "midi"
    readonly property var color: effects.find(effect => effect.type === "color" && effect.id === "inspector:color")
    readonly property string matteEffectId: timelineModel ? timelineModel.effectMatteId : ""
    function toggleMatte(id) { timelineModel.setEffectMattePreview(clip.id, matteEffectId === id ? "" : id) }
    function clearMatte() { if (timelineModel && matteEffectId) timelineModel.setEffectMattePreview("", "") }
    onLockedChanged: if (locked) clearMatte()
    onEffectsChanged: if (matteEffectId && !effects.some(effect => effect.id === matteEffectId && effect.enabled)) clearMatte()
    property string observedId: ""
    property bool gesturing: false
    property bool staleRelease: false
    property InspectorEdits edits: InspectorEdits {
        model: root.timelineModel
    }
    property Connections selection: Connections {
        target: root.controller
        function onChanged() {
            const next = root.clip.id || "";
            if (next !== root.observedId) {
                root.clearMatte();
                root.observedId = next;
                root.staleRelease = root.gesturing;
                root.gesturing = false;
                root.edits.cancelGesture();
            }
        }
    }
    Component.onDestruction: { clearMatte(); edits.cancelGesture() }
    function begin() {
        if (!locked) {
            gesturing = true;
            staleRelease = false;
            edits.beginGesture("patchClip", {
                clipId: clip.id
            });
        }
    }
    function cancel() {
        gesturing = false;
        staleRelease = false;
        edits.cancelGesture();
    }
    function write(next, phase = "apply") {
        if (locked) {
            cancel();
            return;
        }
        const payload = {
            clipId: clip.id,
            patch: {
                effects: next
            }
        };
        if (phase === "preview")
            edits.preview(payload);
        else if (phase === "commit") {
            if (staleRelease) {
                staleRelease = false;
                return;
            }
            if (gesturing) {
                gesturing = false;
                edits.commit("patchClip", payload);
            } else
                edits.apply("patchClip", payload);
        } else {
            staleRelease = false;
            edits.apply("patchClip", payload);
        }
    }
    function patch(id, change, phase = "apply") {
        write(effects.map(effect => {
            if (effect.id !== id)
                return effect;
            const next = Object.assign({}, effect);
            for (const key of Object.keys(change)) {
                if (change[key] === undefined)
                    delete next[key];
                else
                    next[key] = change[key];
            }
            return next;
        }), phase);
    }
    function updateColor(change, phase = "apply") {
        if (!visual || (!color?.enabled && change.enabled === undefined))
            return;
        const next = {
            id: "inspector:color",
            type: "color",
            enabled: color?.enabled ?? false
        };
        for (const field of Catalog.colorFields) {
            if (color && color[field.key] !== undefined)
                next[field.key] = color[field.key];
        }
        Object.assign(next, change);
        const index = effects.findIndex(effect => effect.id === next.id);
        const out = effects.slice();
        if (index < 0)
            out.push(next);
        else
            out[index] = next;
        write(out, phase);
    }
    function resetColor() {
        if (color)
            write(effects.filter(effect => effect.id !== "inspector:color"));
    }
    function add(type) {
        if (!visual || locked)
            return "";
        const effect = Catalog.makeEffect(type, ClipEffectsUi.newId());
        if (!effect)
            return "";
        write(effects.concat([effect]));
        return effect.id;
    }
    function remove(id) {
        write(effects.filter(effect => effect.id !== id));
    }
    function processingStage(effect) { return effect.type === "denoise" ? -2 : effect.type === "stabilize" ? -1 : effect.type === "color" ? 1 : effect.type === "blur" ? 2 : 0 }
    function orderedEffects() {
        return effects
            .map((effect, index) => ({effect: effect, index: index}))
            .sort((a, b) => processingStage(a.effect) - processingStage(b.effect) || a.index - b.index)
            .map(entry => entry.effect)
    }
    function move(id, delta) {
        const next = effects.slice();
        const from = next.findIndex(effect => effect.id === id);
        if (from < 0 || processingStage(next[from]) !== 0)
            return;
        let to = from + delta;
        while (to >= 0 && to < next.length && processingStage(next[to]) !== 0)
            to += delta;
        if (to < 0 || to >= next.length)
            return;
        [next[from], next[to]] = [next[to], next[from]];
        write(next);
    }
    function drop(fromId, toId) {
        const visible = effects.filter(effect => processingStage(effect) === 0);
        const from = visible.findIndex(effect => effect.id === fromId);
        const to = visible.findIndex(effect => effect.id === toId);
        if (from < 0 || to < 0 || from === to)
            return;
        const moved = visible.splice(from, 1)[0];
        visible.splice(to, 0, moved);
        let index = 0;
        write(effects.map(effect => processingStage(effect) !== 0 ? effect : visible[index++]));
    }
}
