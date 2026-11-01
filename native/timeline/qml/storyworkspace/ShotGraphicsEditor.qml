import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The shot's graphics intent: composition mode, direction, and its text and asset elements.
// Protected copy comes from the production inputs and is read-only here. A port of web ShotGraphicsEditor.
ColumnLayout {
    id: root
    objectName: "shotGraphicsEditor"
    required property var shot
    property var graphics: undefined
    property bool readOnly: false
    signal graphicsEdited(var graphics)
    spacing: Ui.Metrics.sm

    readonly property var protectedInputs: (shot.production || {}).protected_inputs || []
    function protection(element) { return protectedInputs.find(input => input.id === element.protected_input_id) || null }
    function edit(patch) { graphicsEdited(Object.assign({}, graphics, patch)) }
    function patchElement(id, patch) {
        if (readOnly || !graphics) return
        edit({elements: (graphics.elements || []).map(element => element.id === id ? Object.assign({}, element, patch) : element)})
    }
    function addText() {
        const ids = (graphics.elements || []).map(element => element.id)
        let suffix = 1
        while (ids.includes("text-" + suffix)) ++suffix
        edit({elements: (graphics.elements || []).concat([{id: "text-" + suffix, kind: "text", text: "Your text"}])})
    }

    Ui.Text { text: "Graphics"; role: Ui.Typography.SansLabel }
    Ui.EditorButton {
        objectName: "shotGraphicsAdd"
        visible: !root.graphics
        enabled: !root.readOnly
        text: "Add graphics intent"
        onClicked: root.graphicsEdited({mode: "overlay", elements: []})
    }
    ColumnLayout {
        visible: !!root.graphics
        Layout.fillWidth: true
        spacing: Ui.Metrics.sm
        Ui.Text { text: "Composition mode"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
        Ui.Select {
            objectName: "shotGraphicsMode"
            Layout.fillWidth: true
            options: [{label: "None", value: "none"}, {label: "Overlay", value: "overlay"}, {label: "Graphics first", value: "graphics_first"}, {label: "Hybrid", value: "hybrid"}]
            value: root.graphics ? root.graphics.mode || "overlay" : "overlay"
            accessibleName: "Composition mode"
            enabled: !root.readOnly
            onValueCommitted: next => root.edit({mode: next})
        }
        Ui.Text { text: "Graphic direction"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
        Ui.TextArea {
            objectName: "shotGraphicsDirection"
            Layout.fillWidth: true
            value: root.graphics ? root.graphics.direction || "" : ""
            accessibleName: "Graphic direction"
            enabled: !root.readOnly
            onValuePreviewed: next => root.edit({direction: next})
        }
        Repeater {
            // A count model keeps each row, and its focused field, while the draft changes under it.
            model: root.graphics ? (root.graphics.elements || []).length : 0
            delegate: ColumnLayout {
                id: element
                required property int index
                readonly property var modelData: (root.graphics.elements || [])[index] || ({})
                readonly property var guard: root.protection(modelData)
                Layout.fillWidth: true
                spacing: Ui.Metrics.xs
                Ui.Text { text: (element.modelData.role || element.modelData.kind) + ": " + element.modelData.id; role: Ui.Typography.SansCaption }
                Ui.Text { visible: element.modelData.kind === "text"; text: "Exact text: " + element.modelData.id; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                Ui.TextField {
                    visible: element.modelData.kind === "text"
                    Layout.fillWidth: true
                    value: element.guard && element.guard.kind === "exact_text" ? element.guard.value || "" : element.modelData.text || ""
                    accessibleName: "Exact text: " + element.modelData.id
                    enabled: !root.readOnly && !element.guard
                    onValuePreviewed: next => root.patchElement(element.modelData.id, {text: next})
                }
                Ui.Text {
                    visible: element.modelData.kind === "text" && !!element.guard
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    text: "Protected copy comes from the production inputs. Edit it there."
                }
                Ui.Text { visible: element.modelData.kind === "asset"; text: "Asset reference: " + element.modelData.id; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                Ui.TextField {
                    visible: element.modelData.kind === "asset"
                    Layout.fillWidth: true
                    value: element.guard && element.guard.asset_id ? element.guard.asset_id : element.modelData.asset_id || ""
                    accessibleName: "Asset reference: " + element.modelData.id
                    enabled: !root.readOnly && !element.guard
                    onValuePreviewed: next => root.patchElement(element.modelData.id, {asset_id: next})
                }
                Ui.Text {
                    readonly property string entity: element.modelData.entity_id || (element.guard ? element.guard.entity_id || "" : "")
                    visible: entity !== ""
                    text: "Entity: " + entity
                    role: Ui.Typography.SansCaption
                }
                Ui.Text { text: "Graphic notes: " + element.modelData.id; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                Ui.TextField {
                    Layout.fillWidth: true
                    value: element.modelData.direction || ""
                    accessibleName: "Graphic notes: " + element.modelData.id
                    enabled: !root.readOnly
                    onValuePreviewed: next => root.patchElement(element.modelData.id, {direction: next})
                }
            }
        }
        Flow {
            Layout.fillWidth: true
            spacing: Ui.Metrics.sm
            Ui.EditorButton { objectName: "shotGraphicsAddText"; text: "Add text"; enabled: !root.readOnly; onClicked: root.addText() }
            Ui.EditorButton { objectName: "shotGraphicsRemove"; text: "Remove graphics intent"; enabled: !root.readOnly; onClicked: root.graphicsEdited(undefined) }
        }
    }
}
