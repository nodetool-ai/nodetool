// InspectorPillInput adapter for the numeric style handlers in the web sections.
// Text prefix keeps this shared helper within package I's owns pattern.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "primitives/InspectorPrimitivesHelpers.js" as Helpers

InspectorPillInput {
    required property var editor
    required property string field
    property real minimum: -Infinity
    property bool exclusiveMinimum: false
    property bool rounded: false
    property real scale: 1
    disabled: editor.locked
    function write(raw, preview) {
        let number = Helpers.parseFiniteNumber(raw);
        if (raw.trim() === "" && allowEmpty) {
            editor.set(field, undefined, preview);
            return;
        }
        if (number === null) {
            if (!preview)
                editor.edits.cancelGesture();
            return;
        }
        if (rounded)
            number = Math.round(number);
        if (exclusiveMinimum ? number <= minimum : number < minimum) {
            if (!preview)
                editor.edits.cancelGesture();
            return;
        }
        editor.set(field, number * scale, preview);
    }
    onGestureStarted: editor.begin()
    onPreview: raw => write(raw, true)
    onCommit: raw => write(raw, false)
    onCanceled: editor.edits.cancelGesture()
}
