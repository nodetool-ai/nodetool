import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    required property var descriptor
    required property var value
    required property bool writable
    property var controller: typeof modelPickerController === "undefined" ? null : modelPickerController
    property string search: ""
    property string provider: ""
    readonly property string selectedId: typeof value === "string" ? value : value && value.id ? value.id : ""
    readonly property string selectedProvider: value && value.provider ? value.provider : ""
    readonly property var allowed: descriptor.allowedProviders || []
    readonly property var models: controller ? controller.models.filter(function(model) {
        return (!allowed.length || allowed.includes(model.provider))
            && (!provider || provider === model.provider)
            && (String(model.name || model.id) + " " + model.id + " " + model.provider).toLowerCase().includes(search.toLowerCase())
    }) : []
    readonly property var providerOptions: {
        const rows = [{label: "All providers", value: ""}]
        if (controller) controller.models.forEach(function(model) {
            if ((!allowed.length || allowed.includes(model.provider)) && !rows.some(row => row.value === model.provider))
                rows.push({label: model.provider, value: model.provider})
        })
        return rows
    }
    readonly property var options: models.map(model => ({
        label: (model.name || model.id) + " · " + model.provider,
        value: model.provider + "\n" + model.id,
        enabled: !model.execution || model.execution.state === "ready"
    }))
    signal valueCommitted(var value)
    spacing: Ui.Metrics.xs
    function cancelEdit() { search = ""; provider = "" }
    Ui.Text {
        Layout.fillWidth: true
        text: root.selectedId ? root.selectedId + (root.selectedProvider ? " · " + root.selectedProvider : "") : "No model selected"
        role: Ui.Typography.SansCaption
        wrapMode: Text.WrapAnywhere
    }
    Ui.TextField {
        objectName: "model-search-" + root.descriptor.name
        Layout.fillWidth: true
        value: root.search
        accessibleName: "Search models"
        placeholderText: "Search models"
        enabled: root.writable
        onValueCommitted: value => root.search = value
        onValuePreviewed: value => root.search = value
    }
    Ui.Select {
        objectName: "model-provider-" + root.descriptor.name
        Layout.fillWidth: true
        accessibleName: "Model provider"
        enabled: root.writable
        options: root.providerOptions
        value: root.provider
        onValueCommitted: value => root.provider = value
    }
    Ui.Select {
        objectName: "model-select-" + root.descriptor.name
        Layout.fillWidth: true
        accessibleName: "Select " + (root.descriptor.label || root.descriptor.name)
        enabled: root.writable && root.models.length > 0
        options: root.options
        value: root.selectedProvider + "\n" + root.selectedId
        onValueCommitted: value => {
            const model = root.models.find(model => model.provider + "\n" + model.id === value)
            if (!model || !root.writable) return
            const result = {type: "language_model", id: model.id, provider: model.provider, name: model.name || ""}
            if (Array.isArray(model.supported_tasks)) result.supported_tasks = model.supported_tasks
            root.valueCommitted(result)
        }
    }
    Ui.Text {
        Layout.fillWidth: true
        visible: text !== ""
        text: !root.controller ? "Connect to a server to select a model."
            : root.controller.error || (root.controller.loading ? "Loading models…"
            : !root.models.length ? "No matching models. Configure a provider or change the search."
            : root.selectedId && !root.controller.models.some(model => model.id === root.selectedId && (!root.selectedProvider || model.provider === root.selectedProvider))
                ? "Selected model is unavailable. Check its provider configuration."
                : "")
        role: Ui.Typography.SansCaption
        tone: root.controller && root.controller.error ? Ui.Text.Error : Ui.Text.Secondary
        wrapMode: Text.Wrap
    }
    NodeButton {
        text: "Refresh models"
        enabled: root.writable && root.controller && !root.controller.loading
        onClicked: root.controller.refresh()
    }
}
