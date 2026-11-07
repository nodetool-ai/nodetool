import QtQuick
import NodeTool.UiPrimitives as Ui

Ui.EditorButton {
    id: button
    required property var catalog
    property string placeholder: qsTr("Select model")
    property string selectedId: catalog ? catalog.selectedModelId : ""
    property string selectedProvider: catalog ? catalog.selectedProvider : ""
    signal selected(var model)
    signal addProvidersRequested()
    signal connectProviderRequested(string provider)
    property bool providerSetupAvailable: true
    property string searchPlaceholder: qsTr("Search models")
    // The picker, so a host that overlays the button can track its bounds.
    readonly property alias popup: picker
    text: {
        if (selectedId !== "") {
            const name = catalog ? (catalog.modelDetails(selectedId, selectedProvider).name || selectedId) : selectedId
            const unavailable = catalog && catalog.loaded && !catalog.loading && !catalog.hasAvailable(selectedId, selectedProvider)
            return name + (selectedProvider ? " · " + selectedProvider : "") + (unavailable ? qsTr(" (Unavailable)") : "")
        }
        return catalog && catalog.loading ? qsTr("Loading models…") : placeholder
    }
    accessibleName: qsTr("Choose model")
    trailingIconName: "arrowDropDown"
    menuButton: true
    menuExpanded: picker.visible
    onClicked: picker.openAt(button)
    ModelPicker {
        id: picker
        catalog: button.catalog
        currentId: button.selectedId
        currentProvider: button.selectedProvider
        providerSetupAvailable: button.providerSetupAvailable
        searchPlaceholder: button.searchPlaceholder
        onSelected: model => button.selected(model)
        onAddProvidersRequested: button.addProvidersRequested()
        onConnectProviderRequested: provider => button.connectProviderRequested(provider)
    }
}
