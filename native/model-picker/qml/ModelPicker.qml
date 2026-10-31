import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Ui.Popover {
    id: picker
    required property var catalog
    property string currentId: catalog ? catalog.selectedModelId : ""
    property string currentProvider: catalog ? catalog.selectedProvider : ""
    property string highlightedId: ""
    property string highlightedProvider: ""
    property bool allowServerDefault: false
    signal addProvidersRequested()
    signal useServerDefaultRequested()
    signal selected(var model)
    objectName: "sharedModelPicker"
    enabled: !!catalog
    modal: true
    focus: true
    width: Math.min(ModelPickerMetrics.width, parent ? Math.max(0, parent.width - Ui.Metrics.md * 2) : ModelPickerMetrics.width)
    height: Math.min(ModelPickerMetrics.height, parent ? Math.max(0, parent.height - Ui.Metrics.md * 2) : ModelPickerMetrics.height)
    readonly property bool narrow: width < ModelPickerMetrics.narrowWidth
    function openAt(item) {
        if (!catalog) return
        anchor = item
        returnFocusTo = item
        highlightedId = currentId
        highlightedProvider = currentProvider
        if (catalog) catalog.reload()
        positionAt(item)
        open()
        Qt.callLater(restoreHighlight)
    }
    function restoreHighlight() {
        if (!catalog || !modelList) return
        let fallback = -1
        for (let index = 0; index < modelList.count; ++index) {
            const row = catalog.resultAt(index)
            if (!row || !row.available) continue
            if (fallback < 0) fallback = index
            if (row.id === highlightedId && row.provider === highlightedProvider) {
                modelList.currentIndex = index
                return
            }
        }
        modelList.currentIndex = fallback
    }
    function moveHighlight(delta) {
        if (!catalog) return
        let index = modelList.currentIndex
        if (index < 0) index = delta > 0 ? -1 : modelList.count
        while (index + delta >= 0 && index + delta < modelList.count) {
            index += delta
            const row = catalog.resultAt(index)
            if (!row || !row.available) continue
            modelList.currentIndex = index
            highlightedId = row.id
            highlightedProvider = row.provider
            modelList.forceActiveFocus()
            return
        }
    }
    onOpened: searchField.forceActiveFocus()
    Connections {
        target: picker.catalog ? picker.catalog.results : null
        ignoreUnknownSignals: true
        function onModelReset() { Qt.callLater(picker.restoreHighlight) }
    }
    component ActionButton: Ui.EditorButton {
        variant: Ui.EditorButton.Flat
        density: Ui.EditorButton.Compact
    }
    component ProviderAction: Ui.EditorButton {
        id: navAction
        required property string providerId
        property bool compact: false
        objectName: "provider_" + providerId + (compact ? "_compact" : "_rail")
        text: providerId === "All" && !compact ? qsTr("All models") : picker.catalog ? picker.catalog.providerLabel(providerId) : ""
        active: !!picker.catalog && picker.catalog.group === providerId
        variant: Ui.EditorButton.Flat
        density: Ui.EditorButton.Compact
        contentAlignment: Qt.AlignLeft
        iconName: providerId === "All" ? "all" : providerId === "Favorites" ? "favorites" : providerId === "Recent" ? "recent" : ""
        providerEntry: iconName === "" ? providerId : ""
        onClicked: picker.catalog.group = providerId
    }
    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.Metrics.none
        RowLayout {
            Layout.fillWidth: true
            Layout.margins: Ui.Metrics.lg
            spacing: Ui.Metrics.md
            Ui.TextField {
                id: searchField
                objectName: "modelPickerSearch"
                Layout.fillWidth: true
                placeholderText: qsTr("Search models")
                value: picker.catalog ? picker.catalog.search : ""
                accessibleName: qsTr("Search models")
                onValuePreviewed: next => picker.catalog.search = next
                Keys.onDownPressed: picker.moveHighlight(1)
                Keys.onUpPressed: picker.moveHighlight(-1)
                Keys.onReturnPressed: picker.commitCurrent()
                Keys.onEscapePressed: picker.close()
            }
            ActionButton {
                objectName: "modelPickerRefresh"
                iconName: "refresh"
                display: AbstractButton.IconOnly
                Layout.preferredWidth: 32
                accessibleName: qsTr("Refresh models")
                onClicked: picker.catalog.reload()
            }
        }
        Ui.Separator { Layout.fillWidth: true }
        Ui.Text { role: Ui.Typography.SansLabel;
            Layout.fillWidth: true
            Layout.leftMargin: Ui.Metrics.lg
            Layout.rightMargin: Ui.Metrics.lg
            visible: !!picker.catalog && (picker.catalog.loading || picker.catalog.error !== "")
            text: picker.catalog ? (picker.catalog.loading ? qsTr("Loading models…") : picker.catalog.error) : ""
            tone: picker.catalog && picker.catalog.error !== "" ? Ui.Text.Warning : Ui.Text.Secondary
            wrapMode: Text.Wrap
        }
        RowLayout {
            visible: !!picker.catalog && picker.catalog.needsProviderSetup && !picker.catalog.loading
            Layout.fillWidth: true
            Layout.leftMargin: Ui.Metrics.lg
            Layout.rightMargin: Ui.Metrics.lg
            Ui.Text { role: Ui.Typography.SansLabel; text: qsTr("Connect an AI provider to use more models"); Layout.fillWidth: true; wrapMode: Text.Wrap }
            ActionButton { text: qsTr("Add API key"); onClicked: picker.addProvidersRequested() }
        }
        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: Ui.Metrics.none
            RowLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: Ui.Metrics.none
                ScrollView {
                    Layout.preferredWidth: picker.narrow ? 0 : ModelPickerMetrics.railWidth
                    Layout.fillHeight: true
                    visible: !picker.narrow
                    clip: true
                    contentWidth: availableWidth
                    Column {
                        x: Ui.Metrics.sm
                        width: parent.width - Ui.Metrics.sm * 2
                        Repeater {
                            model: ["All", "Favorites", "Recent"]
                            delegate: ProviderAction {
                                required property string modelData
                                providerId: modelData
                                width: parent.width
                            }
                        }
                        Ui.Text { role: Ui.Typography.SansCaption;
                            visible: !!picker.catalog && picker.catalog.cloudProviders.length > 0
                            x: Ui.Metrics.md
                            width: parent.width - Ui.Metrics.md * 2
                            text: qsTr("CLOUD")
                            tone: Ui.Text.Secondary
                        }
                        Repeater {
                            model: picker.catalog ? picker.catalog.cloudProviders : null
                            delegate: ProviderAction { required property string modelData; providerId: modelData; width: parent.width }
                        }
                        Ui.Text { role: Ui.Typography.SansCaption;
                            visible: !!picker.catalog && picker.catalog.localProviders.length > 0
                            x: Ui.Metrics.md
                            width: parent.width - Ui.Metrics.md * 2
                            text: qsTr("LOCAL")
                            tone: Ui.Text.Secondary
                        }
                        Repeater {
                            model: picker.catalog ? picker.catalog.localProviders : null
                            delegate: ProviderAction { required property string modelData; providerId: modelData; width: parent.width }
                        }
                    }
                }
                Ui.Separator { visible: !picker.narrow; orientation: Qt.Vertical; Layout.fillHeight: true }
                ColumnLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    spacing: Ui.Metrics.none
                    ScrollView {
                        visible: picker.narrow
                        Layout.fillWidth: true
                        Layout.preferredHeight: Ui.Metrics.standard + Ui.Metrics.md
                        contentHeight: Ui.Metrics.standard + Ui.Metrics.md
                        Row {
                            x: Ui.Metrics.md
                            y: Ui.Metrics.md / 2
                            spacing: Ui.Metrics.md
                            Repeater {
                                model: ["All", "Favorites", "Recent"].concat(picker.catalog ? picker.catalog.providers : [])
                                delegate: ProviderAction {
                                    required property string modelData
                                    providerId: modelData
                                    compact: true
                                    width: Math.min(implicitWidth, picker.width - Ui.Metrics.xl * 2)
                                }
                            }
                        }
                    }
                    Ui.Text { role: Ui.Typography.SansLabel;
                        visible: !!picker.catalog && !picker.catalog.loading && modelList.count === 0
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        wrapMode: Text.Wrap
                        tone: Ui.Text.Secondary
                        text: !picker.catalog ? "" : picker.catalog.error !== "" ? qsTr("Unable to load models. Refresh to try again.") :
                              picker.catalog.search !== "" ? qsTr("No matching models") : qsTr("No models available")
                    }
                    ListView {
                        id: modelList
                        objectName: "modelPickerResults"
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        clip: true
                        model: picker.catalog ? picker.catalog.results : null
                        onCountChanged: Qt.callLater(picker.restoreHighlight)
                        highlightMoveDuration: 0
                        Keys.onDownPressed: picker.moveHighlight(1)
                        Keys.onUpPressed: picker.moveHighlight(-1)
                        Keys.onReturnPressed: picker.commitCurrent()
                        Keys.onEscapePressed: picker.close()
                        delegate: Ui.ListRow {
                            id: row
                            objectName: "choose_" + provider + "_" + modelId
                            required property int index
                            required property string modelId
                            required property string provider
                            required property string name
                            required property string detail
                            required property string executionLabel
                            required property bool favorite
                            required property bool isDefault
                            required property bool current
                            required property bool available
                            width: modelList.width
                            height: ModelPickerMetrics.rowHeight
                            active: modelList.currentIndex === index
                            accessibleName: name + (available ? "" : qsTr(", unavailable"))
                            onClicked: if (available) picker.choose(modelId, provider)
                            opacity: available ? 1 : 0.5
                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: Ui.Metrics.lg
                                anchors.rightMargin: Ui.Metrics.md
                                spacing: Ui.Metrics.sm
                                Ui.Icon { name: "check"; opacity: row.modelId === picker.currentId && row.provider === picker.currentProvider ? 1 : 0; Layout.preferredWidth: Ui.Metrics.iconSm; Layout.preferredHeight: Ui.Metrics.iconSm }
                                Ui.Text { objectName: "model_label_" + row.provider + "_" + row.modelId; role: Ui.Typography.SansLabel; text: row.name; elide: Text.ElideRight; Layout.fillWidth: true }
                                Ui.Text { role: Ui.Typography.SansCaption; text: (picker.catalog ? picker.catalog.providerLabel(row.provider) : row.provider) + (row.executionLabel ? " · " + row.executionLabel : ""); tone: Ui.Text.Secondary; elide: Text.ElideRight; Layout.maximumWidth: 128;}
                                Ui.ToolbarIconButton {
                                    objectName: "favorite_" + row.provider + "_" + row.modelId
                                    iconName: row.favorite ? "star" : "favoriteOutline"
                                    accessibleName: row.favorite ? qsTr("Remove favorite") : qsTr("Add favorite")
                                    checkable: true
                                    checked: row.favorite
                                    onClicked: picker.catalog.toggleFavorite(row.modelId, row.provider)
                                }
                                Ui.ToolbarIconButton {
                                    objectName: "default_" + row.provider + "_" + row.modelId
                                    iconName: "pushPin"
                                    accessibleName: row.isDefault ? qsTr("Remove default") : qsTr("Set default")
                                    checkable: true
                                    checked: row.isDefault
                                    onClicked: picker.catalog.setDefault(row.modelId, row.provider)
                                }
                            }

                        }
                    }
                }
            }
        }
        Ui.Separator { Layout.fillWidth: true }
        RowLayout {
            objectName: "modelPickerFooter"
            Layout.fillWidth: true
            Layout.margins: Ui.Metrics.md
            ActionButton { objectName: "modelPickerServerDefault"; visible: picker.allowServerDefault; Layout.fillWidth: picker.narrow; text: qsTr("Server default"); onClicked: picker.useServerDefaultRequested() }
            Ui.Text { role: Ui.Typography.SansLabel; visible: !picker.narrow; text: qsTr("Missing a provider?"); tone: Ui.Text.Secondary; Layout.fillWidth: true }
            ActionButton { Layout.fillWidth: picker.narrow; text: qsTr("Add providers"); onClicked: picker.addProvidersRequested() }
        }
    }
    function choose(id, provider) {
        if (!catalog) return
        catalog.selectModel(id, provider)
        if (catalog.selectedModelId === id && catalog.selectedProvider === provider) {
            highlightedId = id
            highlightedProvider = provider
            selected(catalog.selectedModel)
            close()
        }
    }
    function commitCurrent() {
        if (!catalog) return
        const row = catalog.resultAt(modelList.currentIndex)
        if (row && row.available) choose(row.id, row.provider)
    }
}
