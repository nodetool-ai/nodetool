pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline

InspectorPillInput {
    id: root
    required property var editor
    required property string effectId
    required property string field
    required property var effect
    property int channelIndex: -1
    property real fallback: 0
    property var minimum: undefined
    property bool exclusiveMin: false
    property real numberStep: 1
    property bool fixedDecimals: false
    property var scrubMinimum: undefined
    readonly property real currentValue: channelIndex < 0 ? (effect[field] ?? fallback) : (effect[field]?.[channelIndex] ?? fallback)
    objectName: "effects_" + effectId + "_" + field + (channelIndex < 0 ? "" : "_" + channelIndex)
    value: fixedDecimals ? currentValue.toFixed(2) : String(currentValue)
    disabled: editor.locked
    scrub: {
        const spec = {
            step: numberStep
        };
        if (scrubMinimum !== undefined)
            spec.min = scrubMinimum;
        return spec;
    }
    onGestureStarted: editor.begin()
    onPreview: raw => submit(raw, "preview")
    onCommit: raw => submit(raw, "commit")
    function submit(raw, phase) {
        const value = raw.trim() === "" ? NaN : Number(raw);
        if (!Number.isFinite(value) || (minimum !== undefined && (exclusiveMin ? value <= minimum : value < minimum))) {
            if (phase === "commit")
                editor.cancel();
            return;
        }
        const patch = {};
        if (channelIndex >= 0) {
            const triple = (effect[field] || [fallback, fallback, fallback]).slice();
            triple[channelIndex] = value;
            patch[field] = triple;
        } else
            patch[field] = value;
        editor.patch(effectId, patch, phase);
    }
}
