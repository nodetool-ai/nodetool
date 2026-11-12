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
    property bool providerSetupAvailable: true
    property string searchPlaceholder: qsTr("Search models")
    // A provider names the key to highlight, as handleConnectProvider in the web menu.
    signal addProvidersRequested()
    signal connectProviderRequested(string provider)
    signal useServerDefaultRequested()
    signal selected(var model)
    objectName: "sharedModelPicker"
    enabled: !!catalog
    modal: true
    // The web menu's backdrop is transparent.
    dim: false
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
        if (typeof catalog.prepareOpen === "function") catalog.prepareOpen()
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
    // The minimal DownloadProgress of the web: label, byte counts, a bar and Cancel.
    component DownloadState: RowLayout {
        required property var progress
        required property string rowKey
        spacing: Ui.Metrics.xs
        ColumnLayout {
            spacing: Ui.Metrics.xs
            Layout.preferredWidth: ModelPickerMetrics.progressWidth
            RowLayout {
                Layout.fillWidth: true
                Ui.Text { objectName: "downloadProgress_" + rowKey; role: Ui.Typography.SansCaption; text: progress.label; tone: progress.status === "error" ? Ui.Text.Error : Ui.Text.Primary; Layout.fillWidth: true }
                Ui.Text { role: Ui.Typography.SansCaption; text: progress.size; tone: Ui.Text.Secondary; visible: text !== "" }
            }
            Ui.Progress { from: 0; to: 1; value: progress.fraction; accessibleName: progress.label; Layout.fillWidth: true }
        }
        Ui.ToolbarIconButton {
            objectName: "cancelDownload_" + rowKey
            visible: progress.canCancel === true
            iconName: "close"
            accessibleName: qsTr("Cancel download")
            onClicked: picker.catalog.cancelDownload(progress.id)
        }
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
                placeholderText: picker.searchPlaceholder
                value: picker.catalog ? picker.catalog.search : ""
                accessibleName: picker.searchPlaceholder
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
        // The loading and failed-provider strip of ModelMenuDialogBase.tsx.
        RowLayout {
            id: statusStrip
            readonly property int failed: picker.catalog && picker.catalog.failedProviderCount ? picker.catalog.failedProviderCount : 0
            objectName: "modelPickerStatus"
            visible: !!picker.catalog && (picker.catalog.loading || picker.catalog.error !== "")
            Layout.fillWidth: true
            Layout.leftMargin: Ui.Metrics.lg
            Layout.rightMargin: Ui.Metrics.lg
            Layout.topMargin: Ui.Metrics.sm
            Layout.bottomMargin: Ui.Metrics.sm
            spacing: Ui.Metrics.md
            Ui.BusyIndicator {
                visible: !!picker.catalog && picker.catalog.loading
                running: visible
                accessibleName: statusText.text
                Layout.preferredWidth: Ui.Metrics.iconSm
                Layout.preferredHeight: Ui.Metrics.iconSm
            }
            Ui.Icon {
                visible: !!picker.catalog && !picker.catalog.loading && picker.catalog.error !== ""
                name: "warning"
                tone: Ui.Text.Warning
                Layout.preferredWidth: Ui.Metrics.iconSm
                Layout.preferredHeight: Ui.Metrics.iconSm
            }
            Ui.Text {
                id: statusText
                objectName: "modelPickerStatusText"
                role: Ui.Typography.SansCaption
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                tone: picker.catalog && !picker.catalog.loading && picker.catalog.error !== "" ? Ui.Text.Warning : Ui.Text.Secondary
                text: {
                    if (!picker.catalog) return ""
                    if (picker.catalog.loading) return picker.catalog.loadingText || qsTr("Loading models")
                    if (statusStrip.failed === 1) return qsTr("1 provider failed to load")
                    if (statusStrip.failed > 1) return qsTr("%1 providers failed to load").arg(statusStrip.failed)
                    return picker.catalog.error
                }
                HoverHandler { id: statusHover }
                Ui.Tooltip {
                    trigger: statusText
                    visible: statusHover.hovered && statusStrip.failed > 0
                    text: qsTr("Failed to load models from:") + "\n" + (picker.catalog ? picker.catalog.error : "")
                }
            }
        }
        Ui.Separator { visible: statusStrip.visible; Layout.fillWidth: true }
        // promptForApiKey: shown while no API model is ready.
        Ui.ListRow {
            id: addKeyRow
            objectName: "modelPickerAddKey"
            visible: picker.providerSetupAvailable && !!picker.catalog && picker.catalog.showAddKeyRow === true
            Layout.fillWidth: true
            Layout.preferredHeight: ModelPickerMetrics.downloadRowHeight
            accessibleName: qsTr("Add an API key")
            onClicked: picker.requestProviders("")
            // The web row insets its content by 16 px, the row's 8 px plus this.
            RowLayout {
                x: Ui.Metrics.md
                width: Math.max(0, addKeyRow.availableWidth - Ui.Metrics.md * 2)
                height: addKeyRow.availableHeight
                spacing: Ui.Metrics.md
                Ui.Icon { name: "add"; tone: Ui.Text.Info; Layout.preferredWidth: Ui.Metrics.iconSm; Layout.preferredHeight: Ui.Metrics.iconSm }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.none
                    Ui.Text { role: Ui.Typography.SansLabel; text: qsTr("Add an API key"); Layout.fillWidth: true; elide: Text.ElideRight }
                    Ui.Text { role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; text: qsTr("Use cloud models from OpenAI, Anthropic, Google and others."); Layout.fillWidth: true; elide: Text.ElideRight }
                }
            }
        }
        Ui.Separator { visible: addKeyRow.visible; Layout.fillWidth: true }
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
                    // The empty states of ModelMenuDialogBase.tsx and ModelList.tsx.
                    Item {
                        id: emptyPane
                        readonly property string group: picker.catalog ? picker.catalog.group : "All"
                        readonly property bool providerView: group !== "All" && group !== "Favorites" && group !== "Recent"
                        readonly property bool providerEmpty: !!picker.catalog && picker.catalog.loaded === true && providerView
                            && typeof picker.catalog.providerHasModels === "function" && !picker.catalog.providerHasModels(group)
                        readonly property string providerName: picker.catalog && providerView ? picker.catalog.providerLabel(group) : ""
                        visible: !!picker.catalog && !picker.catalog.loading && (modelList.count === 0 || providerEmpty)
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        Ui.EmptyState {
                            objectName: "modelPickerEmpty"
                            anchors.centerIn: parent
                            maxTextWidth: Math.max(0, emptyPane.width - Ui.Metrics.xl * 2)
                            title: {
                                if (!picker.catalog) return ""
                                if (emptyPane.providerEmpty) return qsTr("%1 has no models yet").arg(emptyPane.providerName)
                                if (picker.catalog.error !== "") return qsTr("Unable to load models. Refresh to try again.")
                                if (picker.catalog.search.trim() !== "") return qsTr("No models found")
                                if (picker.catalog.hasDownloads === true) return qsTr("No models yet")
                                return qsTr("No models available")
                            }
                            message: {
                                if (!picker.catalog || picker.catalog.error !== "") return ""
                                if (emptyPane.providerEmpty) return qsTr("Connect %1 to see its models here.").arg(emptyPane.providerName)
                                if (picker.catalog.search.trim() !== "") return qsTr("No models match \"%1\". Try another term or enable more providers.").arg(picker.catalog.search)
                                if (picker.catalog.hasDownloads === true) return qsTr("Download a local model or add an API key for a cloud provider.")
                                return qsTr("Enable a provider in the sidebar or add an API key in settings.")
                            }
                            actionText: {
                                if (!picker.catalog || !picker.providerSetupAvailable || picker.catalog.error !== "") return ""
                                if (emptyPane.providerEmpty) return qsTr("Connect %1").arg(emptyPane.providerName)
                                return picker.catalog.search.trim() !== "" ? "" : qsTr("Open settings")
                            }
                            onActionTriggered: picker.requestProviders(emptyPane.providerEmpty ? emptyPane.group : "")
                        }
                    }
                    ListView {
                        id: modelList
                        objectName: "modelPickerResults"
                        visible: !emptyPane.visible
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
                            // Fields a host catalog adds. A catalog without them shows model rows only.
                            readonly property var entry: picker.catalog && typeof picker.catalog.resultAt === "function" ? picker.catalog.resultAt(index) : null
                            readonly property string kind: entry && entry.kind ? entry.kind : "model"
                            readonly property var download: entry && entry.download && entry.download.status ? entry.download : null
                            readonly property bool needsDownload: !!entry && entry.needsDownload === true
                            readonly property string downloadHint: entry && entry.downloadHint ? entry.downloadHint : ""
                            readonly property string executionState: entry && entry.executionState ? entry.executionState : ""
                            width: modelList.width
                            height: kind === "header" ? ModelPickerMetrics.sectionHeight : kind === "recommended" ? ModelPickerMetrics.downloadRowHeight : ModelPickerMetrics.rowHeight
                            hoverEnabled: kind !== "header"
                            focusPolicy: kind === "header" ? Qt.NoFocus : Qt.StrongFocus
                            active: kind !== "header" && modelList.currentIndex === index
                            accessibleName: name + (available || kind === "header" ? "" : qsTr(", unavailable"))
                            onClicked: if (available && kind !== "header") picker.choose(modelId, provider)
                            opacity: available || kind !== "model" || needsDownload ? 1 : 0.5
                            RowLayout {
                                visible: row.kind === "header"
                                anchors.fill: parent
                                anchors.leftMargin: Ui.Metrics.md
                                anchors.rightMargin: Ui.Metrics.md
                                Ui.Text { role: Ui.Typography.SansCaption; text: row.name; tone: Ui.Text.Secondary; Layout.fillWidth: true; Layout.alignment: Qt.AlignBottom }
                                Ui.Text { role: Ui.Typography.SansCaption; text: row.detail; tone: Ui.Text.Secondary; Layout.alignment: Qt.AlignBottom }
                            }
                            RowLayout {
                                visible: row.kind === "recommended"
                                anchors.fill: parent
                                anchors.leftMargin: Ui.Metrics.lg
                                anchors.rightMargin: Ui.Metrics.md
                                spacing: Ui.Metrics.md
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: Ui.Metrics.none
                                    Ui.Text { objectName: "recommended_label_" + row.provider + "_" + row.modelId; role: Ui.Typography.SansLabel; text: row.name; elide: Text.ElideRight; Layout.fillWidth: true }
                                    Ui.Text { role: Ui.Typography.SansCaption; text: row.detail; tone: Ui.Text.Secondary; elide: Text.ElideRight; Layout.fillWidth: true }
                                }
                                Loader {
                                    active: row.kind === "recommended" && row.download !== null
                                    visible: active
                                    sourceComponent: DownloadState { progress: row.download; rowKey: row.provider + "_" + row.modelId }
                                }
                                Ui.Text { visible: row.kind === "recommended" && row.download === null && row.executionLabel !== ""; role: Ui.Typography.SansCaption; text: row.executionLabel; tone: Ui.Text.Secondary }
                                ActionButton {
                                    objectName: "use_" + row.provider + "_" + row.modelId
                                    visible: row.kind === "recommended" && row.download === null && row.available
                                    variant: Ui.EditorButton.Primary
                                    iconName: "check"
                                    text: qsTr("Use")
                                    description: qsTr("Use this model")
                                    onClicked: picker.choose(row.modelId, row.provider)
                                }
                                ActionButton {
                                    objectName: "download_" + row.provider + "_" + row.modelId
                                    visible: row.kind === "recommended" && row.download === null && row.needsDownload
                                    variant: Ui.EditorButton.Default
                                    iconName: "fileDownload"
                                    text: qsTr("Download")
                                    description: row.downloadHint
                                    onClicked: picker.catalog.requestDownload(row.modelId, row.provider)
                                }
                            }
                            RowLayout {
                                visible: row.kind === "model"
                                anchors.fill: parent
                                anchors.leftMargin: Ui.Metrics.lg
                                anchors.rightMargin: Ui.Metrics.md
                                spacing: Ui.Metrics.sm
                                Ui.Icon { name: "check"; opacity: row.modelId === picker.currentId && row.provider === picker.currentProvider ? 1 : 0; Layout.preferredWidth: Ui.Metrics.iconSm; Layout.preferredHeight: Ui.Metrics.iconSm }
                                // NAME_SX and DETAIL_SX in ModelList.tsx: the name keeps its width, the detail takes the rest.
                                Ui.Text { id: modelName; objectName: "model_label_" + row.provider + "_" + row.modelId; role: Ui.Typography.SansLabel; text: row.name; elide: Text.ElideRight; Layout.preferredWidth: Math.min(implicitWidth, row.width / 2); Layout.minimumWidth: 0 }
                                Ui.Text { role: Ui.Typography.SansCaption; text: row.detail; tone: Ui.Text.Secondary; elide: Text.ElideRight; Layout.fillWidth: true; Layout.minimumWidth: 0 }
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
                                Loader {
                                    active: row.kind === "model" && row.needsDownload && row.download !== null
                                    visible: active
                                    sourceComponent: DownloadState { progress: row.download; rowKey: row.provider + "_" + row.modelId }
                                }
                                ActionButton {
                                    objectName: "download_" + row.provider + "_" + row.modelId
                                    visible: row.kind === "model" && row.needsDownload && row.download === null
                                    variant: Ui.EditorButton.Default
                                    iconName: "fileDownload"
                                    text: qsTr("Download")
                                    description: row.downloadHint
                                    onClicked: picker.catalog.requestDownload(row.modelId, row.provider)
                                }
                                // The execution chip colour of ModelList.tsx.
                                Ui.Text {
                                    visible: !row.needsDownload && row.executionLabel !== ""
                                    role: Ui.Typography.SansCaption
                                    text: row.executionLabel
                                    tone: row.executionState === "download_required" ? Ui.Text.Warning
                                        : row.executionState !== "" && row.executionState !== "ready" ? Ui.Text.Secondary
                                        : row.executionLabel === "API" ? Ui.Text.Info : Ui.Text.Success
                                    elide: Text.ElideRight
                                    Layout.maximumWidth: ModelPickerMetrics.detailMaxWidth
                                }
                            }
                        }
                    }
                }
            }
        }
        Ui.Separator { visible: picker.allowServerDefault || picker.providerSetupAvailable; Layout.fillWidth: true }
        RowLayout {
            objectName: "modelPickerFooter"
            visible: picker.allowServerDefault || picker.providerSetupAvailable
            Layout.fillWidth: true
            Layout.margins: Ui.Metrics.md
            ActionButton { objectName: "modelPickerServerDefault"; visible: picker.allowServerDefault; Layout.fillWidth: picker.narrow; text: qsTr("Server default"); onClicked: picker.useServerDefaultRequested() }
            Ui.Text { role: Ui.Typography.SansLabel; visible: !picker.narrow && picker.providerSetupAvailable; text: qsTr("Missing a provider?"); tone: Ui.Text.Secondary; Layout.fillWidth: true }
            ActionButton { objectName: "modelPickerAddProviders"; visible: picker.providerSetupAvailable; Layout.fillWidth: picker.narrow; iconName: "add"; text: qsTr("Add providers"); onClicked: picker.requestProviders("") }
        }
    }
    // Every provider setup entry closes the menu first, as handleConnectProvider
    // in the web menu. A host handles one of the two signals.
    function requestProviders(provider) {
        close()
        addProvidersRequested()
        connectProviderRequested(provider)
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
