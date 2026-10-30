import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts

Popup {
    id: picker
    required property var catalog
    property Item trigger: null
    property string currentId: catalog ? catalog.selectedModelId : ""
    property string currentProvider: catalog ? catalog.selectedProvider : ""
    property string highlightedId: ""
    property string highlightedProvider: ""
    property bool allowServerDefault: false
    signal addProvidersRequested()
    signal useServerDefaultRequested()
    signal selected(var model)
    objectName: "sharedModelPicker"
    parent: Overlay.overlay
    modal: true
    focus: true
    padding: 0
    width: Math.min(ModelPickerTheme.width, parent ? Math.max(0, parent.width - ModelPickerTheme.margin * 2) : ModelPickerTheme.width)
    height: Math.min(ModelPickerTheme.height, parent ? Math.max(0, parent.height - ModelPickerTheme.margin * 2) : ModelPickerTheme.height)
    readonly property bool narrow: width < ModelPickerTheme.narrowWidth
    readonly property color paper: ModelPickerTheme.paper
    readonly property color textColor: ModelPickerTheme.text
    readonly property color muted: ModelPickerTheme.muted
    readonly property color divider: ModelPickerTheme.divider
    readonly property color accent: ModelPickerTheme.accent
    function openAt(item) {
        trigger = item
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
    function positionAt(item) {
        if (parent && item) {
            const point = item.mapToItem(parent, 0, 0)
            x = Math.max(ModelPickerTheme.margin, Math.min(point.x, parent.width - width - ModelPickerTheme.margin))
            const below = point.y + item.height + 4
            const above = point.y - height - 4
            const target = below + height + ModelPickerTheme.margin <= parent.height ? below : above >= ModelPickerTheme.margin ? above : below
            y = Math.max(ModelPickerTheme.margin, Math.min(target, parent.height - height - ModelPickerTheme.margin))
        }
    }
    onWidthChanged: { if (visible && trigger) positionAt(trigger) }
    onHeightChanged: { if (visible && trigger) positionAt(trigger) }
    onOpened: searchField.forceActiveFocus()
    onClosed: { if (trigger) trigger.forceActiveFocus() }
    Connections {
        target: picker.catalog ? picker.catalog.results : null
        ignoreUnknownSignals: true
        function onModelReset() { Qt.callLater(picker.restoreHighlight) }
    }
    background: Rectangle { color: picker.paper; radius: ModelPickerTheme.radius; border.color: picker.divider }
    component ActionButton: Button {
        id: action
        flat: true
        font.pixelSize: 13
        font.weight: Font.Medium
        background: Rectangle {
            color: action.highlighted ? ModelPickerTheme.selected : action.hovered ? ModelPickerTheme.hover : "transparent"
            radius: ModelPickerTheme.radius
        }
        contentItem: Text {
            text: action.text
            color: picker.textColor
            font: action.font
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }
    }
    component ProviderAction: Button {
        id: navAction
        required property string providerId
        property bool compact: false
        text: providerId === "All" && !compact ? qsTr("All models") : picker.catalog.providerLabel(providerId)
        highlighted: picker.catalog.group === providerId
        flat: true
        hoverEnabled: true
        padding: ModelPickerTheme.navInset
        implicitHeight: compact ? ModelPickerTheme.navChipHeight : ModelPickerTheme.navRowHeight
        implicitWidth: navContent.implicitWidth + leftPadding + rightPadding
        font.pixelSize: ModelPickerTheme.navFontSize
        font.weight: Font.Medium
        background: Rectangle {
            color: navAction.highlighted ? ModelPickerTheme.selected : navAction.hovered ? ModelPickerTheme.hover : "transparent"
            radius: ModelPickerTheme.radius
            border.width: navAction.activeFocus ? ModelPickerTheme.navFocusWidth : 0
            border.color: picker.accent
        }
        contentItem: RowLayout {
            id: navContent
            spacing: ModelPickerTheme.navGap
            ModelPickerNavIcon {
                entry: navAction.providerId
                size: navAction.compact ? ModelPickerTheme.navChipIconSize : ModelPickerTheme.navIconSize
                Layout.preferredWidth: size
                Layout.preferredHeight: size
            }
            Label {
                text: navAction.text
                color: picker.textColor
                font: navAction.font
                horizontalAlignment: Text.AlignLeft
                verticalAlignment: Text.AlignVCenter
                elide: Text.ElideRight
                Layout.fillWidth: !navAction.compact
            }
        }
        onClicked: picker.catalog.group = providerId
    }
    contentItem: ColumnLayout {
        spacing: 0
        RowLayout {
            Layout.fillWidth: true
            Layout.margins: 12
            spacing: 8
            TextField {
                id: searchField
                objectName: "modelPickerSearch"
                Layout.fillWidth: true
                placeholderText: qsTr("Search models")
                placeholderTextColor: picker.muted
                text: picker.catalog ? picker.catalog.search : ""
                color: picker.textColor
                Accessible.name: qsTr("Search models")
                onTextEdited: picker.catalog.search = text
                Keys.onDownPressed: picker.moveHighlight(1)
                Keys.onUpPressed: picker.moveHighlight(-1)
                Keys.onReturnPressed: picker.commitCurrent()
                Keys.onEscapePressed: picker.close()
                background: Rectangle { color: ModelPickerTheme.field; radius: ModelPickerTheme.radius; border.color: searchField.activeFocus ? picker.accent : picker.divider }
            }
            ActionButton {
                objectName: "modelPickerRefresh"
                text: "↻"
                Layout.preferredWidth: 32
                Accessible.name: qsTr("Refresh models")
                onClicked: picker.catalog.reload()
            }
        }
        Rectangle { Layout.fillWidth: true; height: 1; color: picker.divider }
        Label {
            Layout.fillWidth: true
            Layout.leftMargin: 12
            Layout.rightMargin: 12
            visible: picker.catalog && (picker.catalog.loading || picker.catalog.error !== "")
            text: picker.catalog.loading ? qsTr("Loading models…") : picker.catalog.error
            color: picker.catalog.error !== "" ? ModelPickerTheme.warning : picker.muted
            wrapMode: Text.Wrap
        }
        RowLayout {
            visible: picker.catalog.needsProviderSetup && !picker.catalog.loading
            Layout.fillWidth: true
            Layout.leftMargin: 12
            Layout.rightMargin: 12
            Label { text: qsTr("Connect an AI provider to use more models"); color: picker.textColor; Layout.fillWidth: true; wrapMode: Text.Wrap }
            ActionButton { text: qsTr("Add API key"); onClicked: picker.addProvidersRequested() }
        }
        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0
            RowLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: 0
                ScrollView {
                    Layout.preferredWidth: picker.narrow ? 0 : ModelPickerTheme.railWidth
                    Layout.fillHeight: true
                    visible: !picker.narrow
                    clip: true
                    contentWidth: availableWidth
                    Column {
                        x: ModelPickerTheme.navRailGutter
                        width: parent.width - ModelPickerTheme.navRailGutter * 2
                        Repeater {
                            model: ["All", "Favorites", "Recent"]
                            delegate: ProviderAction {
                                required property string modelData
                                providerId: modelData
                                width: parent.width
                            }
                        }
                        Label {
                            visible: picker.catalog.cloudProviders.length > 0
                            width: parent.width
                            text: qsTr("CLOUD")
                            color: picker.muted
                            leftPadding: ModelPickerTheme.navInset
                            topPadding: ModelPickerTheme.navInset
                            bottomPadding: ModelPickerTheme.navGap / 2
                            font.pixelSize: ModelPickerTheme.eyebrowFontSize
                            font.weight: Font.Normal
                            font.letterSpacing: ModelPickerTheme.eyebrowFontSize * 0.06
                        }
                        Repeater {
                            model: picker.catalog.cloudProviders
                            delegate: ProviderAction { required property string modelData; providerId: modelData; width: parent.width }
                        }
                        Label {
                            visible: picker.catalog.localProviders.length > 0
                            width: parent.width
                            text: qsTr("LOCAL")
                            color: picker.muted
                            leftPadding: ModelPickerTheme.navInset
                            topPadding: ModelPickerTheme.navInset
                            bottomPadding: ModelPickerTheme.navGap / 2
                            font.pixelSize: ModelPickerTheme.eyebrowFontSize
                            font.weight: Font.Normal
                            font.letterSpacing: ModelPickerTheme.eyebrowFontSize * 0.06
                        }
                        Repeater {
                            model: picker.catalog.localProviders
                            delegate: ProviderAction { required property string modelData; providerId: modelData; width: parent.width }
                        }
                    }
                }
                Rectangle { visible: !picker.narrow; width: 1; Layout.fillHeight: true; color: picker.divider }
                ColumnLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    spacing: 0
                    ScrollView {
                        visible: picker.narrow
                        Layout.fillWidth: true
                        Layout.preferredHeight: ModelPickerTheme.navRowHeight + ModelPickerTheme.navInset
                        contentHeight: ModelPickerTheme.navRowHeight + ModelPickerTheme.navInset
                        Row {
                            x: ModelPickerTheme.navInset
                            y: ModelPickerTheme.navInset / 2
                            spacing: ModelPickerTheme.navGap
                            Repeater {
                                model: ["All", "Favorites", "Recent"].concat(picker.catalog ? picker.catalog.providers : [])
                                delegate: ProviderAction {
                                    required property string modelData
                                    providerId: modelData
                                    compact: true
                                }
                            }
                        }
                    }
                    Label {
                        visible: !picker.catalog.loading && modelList.count === 0
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        wrapMode: Text.Wrap
                        color: picker.muted
                        text: picker.catalog.error !== "" ? qsTr("Unable to load models. Refresh to try again.") :
                              picker.catalog.search !== "" ? qsTr("No matching models") : qsTr("No models available")
                    }
                    ListView {
                        id: modelList
                        objectName: "modelPickerResults"
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        clip: true
                        model: picker.catalog.results
                        onCountChanged: Qt.callLater(picker.restoreHighlight)
                        highlightMoveDuration: 0
                        Keys.onDownPressed: picker.moveHighlight(1)
                        Keys.onUpPressed: picker.moveHighlight(-1)
                        Keys.onReturnPressed: picker.commitCurrent()
                        Keys.onEscapePressed: picker.close()
                        delegate: Rectangle {
                            id: row
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
                            height: ModelPickerTheme.rowHeight
                            color: modelList.currentIndex === index ? ModelPickerTheme.selected : "transparent"
                            opacity: available ? 1 : 0.5
                            RowLayout {
                                z: 1
                                anchors.fill: parent
                                anchors.leftMargin: 12
                                anchors.rightMargin: 8
                                spacing: 6
                                Label { text: row.modelId === picker.currentId && row.provider === picker.currentProvider ? "✓" : ""; color: picker.accent; Layout.preferredWidth: 16 }
                                Label { text: row.name; color: picker.textColor; elide: Text.ElideRight; Layout.fillWidth: true }
                                Label { text: picker.catalog.providerLabel(row.provider) + (row.executionLabel ? " · " + row.executionLabel : ""); color: picker.muted; elide: Text.ElideRight; Layout.maximumWidth: 128; font.pixelSize: 11 }
                                ActionButton {
                                    objectName: "favorite_" + row.provider + "_" + row.modelId
                                    text: row.favorite ? "★" : "☆"
                                    Layout.preferredWidth: 28
                                    Accessible.name: row.favorite ? qsTr("Remove favorite") : qsTr("Add favorite")
                                    onClicked: picker.catalog.toggleFavorite(row.modelId, row.provider)
                                }
                                ActionButton {
                                    objectName: "default_" + row.provider + "_" + row.modelId
                                    highlighted: row.isDefault
                                    Layout.preferredWidth: 28
                                    Accessible.name: row.isDefault ? qsTr("Remove default") : qsTr("Set default")
                                    onClicked: picker.catalog.setDefault(row.modelId, row.provider)
                                    contentItem: Canvas {
                                        id: pinGlyph
                                        implicitWidth: 16
                                        implicitHeight: 16
                                        property bool active: row.isDefault
                                        onActiveChanged: requestPaint()
                                        onPaint: {
                                            const ctx = getContext("2d")
                                            ctx.reset()
                                            ctx.strokeStyle = active ? picker.textColor : picker.muted
                                            ctx.lineWidth = 1.5
                                            ctx.beginPath()
                                            ctx.moveTo(5, 2)
                                            ctx.lineTo(11, 2)
                                            ctx.lineTo(10, 6)
                                            ctx.lineTo(12, 9)
                                            ctx.lineTo(4, 9)
                                            ctx.lineTo(6, 6)
                                            ctx.closePath()
                                            ctx.stroke()
                                            ctx.beginPath()
                                            ctx.moveTo(8, 9)
                                            ctx.lineTo(8, 15)
                                            ctx.stroke()
                                        }
                                    }
                                }
                            }
                            MouseArea {
                                objectName: "choose_" + row.provider + "_" + row.modelId
                                anchors.fill: parent
                                enabled: row.available
                                onClicked: picker.choose(row.modelId, row.provider)
                            }
                        }
                    }
                }
            }
        }
        Rectangle { Layout.fillWidth: true; height: 1; color: picker.divider }
        RowLayout {
            Layout.fillWidth: true
            Layout.margins: 8
            ActionButton { objectName: "modelPickerServerDefault"; visible: picker.allowServerDefault; text: qsTr("Server default"); onClicked: picker.useServerDefaultRequested() }
            Label { text: qsTr("Missing a provider?"); color: picker.muted; Layout.fillWidth: true }
            ActionButton { text: qsTr("Add providers"); onClicked: picker.addProvidersRequested() }
        }
    }
    function choose(id, provider) {
        catalog.selectModel(id, provider)
        if (catalog.selectedModelId === id && catalog.selectedProvider === provider) {
            highlightedId = id
            highlightedProvider = provider
            selected(catalog.selectedModel)
            close()
        }
    }
    function commitCurrent() {
        const row = catalog.resultAt(modelList.currentIndex)
        if (row && row.available) choose(row.id, row.provider)
    }
}
