import QtQuick
import QtQuick.Controls

Button {
    id: button
    required property var catalog
    property string placeholder: qsTr("Select model")
    property string selectedId: catalog ? catalog.selectedModelId : ""
    property string selectedProvider: catalog ? catalog.selectedProvider : ""
    signal selected(var model)
    signal addProvidersRequested()
    text: {
        if (selectedId !== "") {
            const name = catalog && catalog.selectedModelId === selectedId && catalog.selectedProvider === selectedProvider
                       ? (catalog.selectedModel.name || selectedId) : selectedId
            const unavailable = catalog && catalog.loaded && !catalog.loading && !catalog.hasAvailable(selectedId, selectedProvider)
            return name + (selectedProvider ? " · " + selectedProvider : "") + (unavailable ? qsTr(" (Unavailable)") : "") + " ⌄"
        }
        return catalog && catalog.loading ? qsTr("Loading models…") : placeholder + " ⌄"
    }
    Accessible.name: qsTr("Choose model")
    onClicked: picker.openAt(button)
    ModelPicker {
        id: picker
        catalog: button.catalog
        currentId: button.selectedId
        currentProvider: button.selectedProvider
        onSelected: model => button.selected(model)
        onAddProvidersRequested: button.addProvidersRequested()
    }
}
