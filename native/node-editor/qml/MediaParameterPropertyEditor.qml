import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    objectName: "media-parameter-" + descriptor.name
    required property var descriptor
    required property var value
    required property bool writable
    property var controller: typeof resourcePickerController === "undefined" ? null : resourcePickerController
    property int generation: 0
    property string requestKey: "media-parameter-" + String(root)
    readonly property string key: requestKey + "-" + generation
    readonly property string modelIdentity: JSON.stringify(descriptor.siblingModel || {})
    property var constraints: ({})
    signal scopeInvalidated()
    signal valueCommitted(var value)
    spacing: Ui.Metrics.xs
    readonly property string kind: descriptor.kind || ""
    readonly property var defaults: ({media_aspect_ratio_image: "1:1", media_aspect_ratio_video: "16:9", media_resolution_image: "1K", media_resolution_video: "1080p", media_duration: 4, media_strength: 0.65})
    readonly property var displayedValue: value === null || value === undefined ? defaults[root.kind] : value
    readonly property var vocabulary: ({
        media_aspect_ratio_image: ["21:9", "16:9", "3:2", "7:5", "4:3", "5:4", "1:1", "9:16", "2:3", "5:7", "3:4", "4:5"],
        media_aspect_ratio_video: ["21:9", "16:9", "4:3", "1:1", "9:16", "3:4"],
        media_resolution_image: ["1K", "2K", "4K"],
        media_resolution_video: ["720p", "1080p", "1440p", "4K"],
        media_duration: [2, 3, 4, 5, 6, 8, 10, 12, 15],
        media_strength: [0.25, 0.5, 0.65, 0.75, 0.85, 1.0]
    })
    readonly property var options: {
        const fallback = vocabulary[root.kind] || []
        let allowed = []
        if (root.kind === "media_duration") {
            allowed = (constraints.durations || []).filter(item => Number.isFinite(item) && item > 0)
        } else if (root.kind.includes("resolution")) {
            allowed = (constraints.resolutions || []).filter(item => fallback.includes(item))
        } else if (root.kind.includes("aspect_ratio")) {
            allowed = (constraints.aspect_ratios || []).filter(item => /^(\d+):(\d+)$/.test(item))
        }
        return allowed.length ? allowed : fallback
    }
    function cancelEdit() {
        if (typeof parameterSelect !== "undefined" && parameterSelect) {
            parameterSelect.popup.close()
        }
        if (controller) {
            controller.cancel(key)
        }
        ++generation
    }
    function resetScope() {
        cancelEdit()
        constraints = ({})
    }
    function refresh() {
        resetScope()
        const model = descriptor.siblingModel
        if (controller && writable && model && model.provider && model.id && descriptor.kind !== "media_strength") {
            controller.mediaConstraints(key, root.kind.includes("video") || root.kind === "media_duration", model.provider, model.id)
        }
    }
    onModelIdentityChanged: refresh()
    onWritableChanged: if (!writable) resetScope()
    Component.onCompleted: refresh()
    Component.onDestruction: cancelEdit()
    Connections {
        target: root.controller
        function onCleared() {
            root.resetScope()
            root.scopeInvalidated()
        }
        function onConstraintsListed(key, constraints) {
            if (key === root.key && root.writable) {
                root.constraints = constraints
            }
        }
    }
    Ui.ChipMenu {
        id: parameterSelect
        objectName: "media-parameter-select-" + root.descriptor.name
        iconName: root.kind.includes("aspect_ratio") ? "aspectRatio" : root.kind.includes("resolution") ? "tune" : root.kind === "media_duration" ? "timer" : "tune"
        accessibleName: root.descriptor.label || root.descriptor.name
        enabled: root.writable
        options: root.options.map(item => ({value: item, label: root.kind === "media_duration" ? item + " Sec" : root.kind === "media_strength" ? item.toFixed(2) + " · " + (item <= 0.35 ? "subtle" : item >= 0.85 ? "strong" : "balanced") : String(item)}))
        value: root.options.includes(root.displayedValue) ? root.displayedValue : root.options[0]
        onValueCommitted: value => {
            if (root.writable && root.options.includes(value)) {
                root.valueCommitted(value)
            }
        }
    }
}
