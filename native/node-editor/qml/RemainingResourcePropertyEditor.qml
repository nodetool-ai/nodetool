import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    objectName: "remaining-resource-" + descriptor.name
    required property var descriptor
    required property var value
    required property bool writable
    required property string nodeId
    property var controller: typeof resourcePickerController === "undefined" ? null : resourcePickerController
    property string requestKey: "remaining-" + String(root)
    property int generation: 0
    readonly property string key: requestKey + "-" + generation
    readonly property string projectId: descriptor.projectId || "default"
    onProjectIdChanged: {
        resetScope()
        refresh()
    }
    readonly property string kind: descriptor.kind || ""
    readonly property bool entity: kind === "entity" || kind === "entity_list"
    readonly property bool multiple: kind === "entity_list"
    readonly property string identity: kind === "font" ? "name" : kind === "folder" ? "asset_id" : "id"
    readonly property var selected: multiple ? (value && typeof value !== "string" && typeof value.length === "number" ? Array.from(value) : []) : value ? [value] : []
    property var resources: []
    readonly property var missingTargets: loaded ? selected.filter(item => !resources.some(row => (kind === "font" ? row.name : row.id) === item[identity])) : []
    property bool loading: false
    property bool loaded: false
    property string error: ""
    property string searchText: ""
    property string entityFilter: "all"
    property string folderName: ""
    readonly property var matches: resources.filter(row => row.name.toLowerCase().includes(searchText.toLowerCase()) && (!entity || entityFilter === "all" || row.kind === entityFilter))
    signal valueCommitted(var value)
    signal scopeInvalidated()
    spacing: Ui.Metrics.xs

    function cancelEdit() {
        entityPicker.close()
        folderPopover.close()
        if (controller) {
            controller.cancel(key)
        }
        ++generation
        loading = false
        error = ""
    }
    function resetScope() {
        cancelEdit()
        resources = []
        loaded = false
        searchText = ""
    }
    function refresh() {
        if (!controller || !writable) {
            return
        }
        loading = true
        loaded = false
        error = ""
        controller.remaining(key, kind, projectId)
    }
    function choose(id) {
        const row = resources.find(row => (kind === "font" ? row.name : row.id) === id)
        if (!writable || !row) {
            return
        }
        if (!multiple && value && value[identity] === id) {
            return
        }
        if (multiple) {
            if (!selected.some(item => item.id === id)) {
                valueCommitted(selected.concat([row]))
            }
        } else {
            const next = Object.assign({}, value && typeof value === "object" ? value : {})
            if (kind === "entity") {
                Object.assign(next, row)
            } else {
                next.type = kind
                next[identity] = id
            }
            valueCommitted(next)
        }
    }
    function removeAt(index) {
        if (!writable) {
            return
        }
        if (multiple) {
            valueCommitted(selected.filter((item, i) => i !== index))
        } else if (descriptor.nullable) {
            valueCommitted(null)
        }
    }
    onNodeIdChanged: resetScope()
    onWritableChanged: if (!writable) resetScope()
    onValueChanged: {
        cancelEdit()
        if (writable) refresh()
    }
    Component.onCompleted: refresh()
    Component.onDestruction: cancelEdit()
    Connections {
        target: root.controller
        function onCleared() {
            root.resetScope()
            root.scopeInvalidated()
        }
        function onFolderCreated(key) {
            if (key === root.key && root.writable) {
                root.folderName = ""
                root.refresh()
            }
        }
        function onRemainingListed(key, rows) {
            if (key !== root.key || !root.writable) {
                return
            }
            root.resources = rows
            root.loaded = true
            root.loading = false
        }
        function onFailed(key, message) {
            if (key === root.key) {
                root.loading = false
                root.error = message
            }
        }
    }
    Repeater {
        model: root.selected
        delegate: RowLayout {
            required property var modelData
            required property int index
            visible: !root.entity && root.missingTargets.length > 0
            Layout.fillWidth: true
            Ui.Text {
                Layout.fillWidth: true
                readonly property string selectedId: modelData[root.identity] || ""
                readonly property var resource: root.resources.find(row => (root.kind === "font" ? row.name : row.id) === selectedId)
                text: (resource ? resource.name : modelData.name || selectedId || "Invalid reference") + (root.loaded && !resource ? " · unavailable or deleted" : "")
                role: Ui.Typography.SansCaption
                wrapMode: Text.WrapAnywhere
            }
            NodeButton {
                text: "Remove"
                visible: root.multiple || root.descriptor.nullable === true
                enabled: root.writable
                onClicked: root.removeAt(parent.index)
            }
        }
    }
    Flow {
        visible: root.entity
        Layout.fillWidth: true
        spacing: Ui.Metrics.xs
        Repeater {
            model: root.entity ? root.selected : []
            delegate: Ui.EditorButton {
                required property var modelData
                required property int index
                text: modelData.name || modelData.id || "Untitled entity"
                trailingIconName: "closeOutlined"
                circular: true
                density: Ui.EditorButton.Compact
                contentAlignment: Qt.AlignLeft
                leftPadding: Ui.Metrics.md + Ui.Metrics.sm + Ui.Metrics.xs
                rightPadding: Ui.Metrics.lg
                enabled: root.writable
                accessibleName: "Remove " + text
                onClicked: root.removeAt(index)
                Rectangle {
                    objectName: "entity-kind-dot-" + index
                    x: Ui.Metrics.md
                    anchors.verticalCenter: parent.verticalCenter
                    width: Ui.Metrics.sm
                    height: Ui.Metrics.sm
                    radius: Ui.Metrics.radiusPill
                    color: root.kindColor(modelData.kind)
                    Accessible.ignored: true
                }
            }
        }
        Ui.EditorButton {
            objectName: "entity-picker-open"
            text: root.multiple ? "Add entity" : "Pick entity"
            iconName: "add"
            density: Ui.EditorButton.Compact
            enabled: root.writable
            onClicked: {
                entityPicker.returnFocusTo = this
                entityPicker.open()
            }
        }
    }
    function kindIcon(kind) {
        return kind === "character" ? "personOutline" : kind === "location" ? "placeOutlined" : kind === "style" ? "paletteOutlined" : "categoryOutlined"
    }
    // web/src/components/entities/entityKind.ts ENTITY_KIND_COLOR: primary, info, secondary, success.
    function kindColor(kind) {
        return kind === "location" ? Ui.Theme.statusInfo : kind === "prop" ? Ui.Theme.statusSuccess : kind === "style" ? Ui.Theme.accentSecondary : Ui.Theme.accentPrimary
    }
    Ui.Dialog {
        id: entityPicker
        title: root.multiple ? "Add entity" : "Pick entity"
        width: parent ? Math.min(parent.width, Ui.Metrics.dialogWidth) : Ui.Metrics.dialogWidth
        contentItem: ColumnLayout {
            spacing: Ui.Metrics.md
            Ui.TextField {
                Layout.fillWidth: true
                accessibleName: "Search entities"
                placeholderText: accessibleName
                value: root.searchText
                onValuePreviewed: value => root.searchText = value
            }
            RowLayout {
                spacing: Ui.Metrics.xs
                Repeater {
                    model: ["all", "character", "location", "style", "prop"]
                    delegate: Ui.EditorButton {
                        required property string modelData
                        text: modelData
                        density: Ui.EditorButton.Compact
                        active: root.entityFilter === modelData
                        onClicked: root.entityFilter = modelData
                    }
                }
            }
            Flickable {
                id: gridViewport
                Layout.fillWidth: true
                implicitHeight: Math.min(entityCards.childrenRect.height, Ui.Metrics.touch * 6)
                contentWidth: width
                contentHeight: entityCards.childrenRect.height
                clip: true
                Flow {
                    id: entityCards
                    width: gridViewport.width
                    spacing: Ui.Metrics.md
                    Repeater {
                        model: root.entity ? root.matches : []
                        delegate: Ui.SelectionCard {
                            required property var modelData
                            required property int index
                            objectName: "entity-card-" + index
                            text: modelData.name || "Untitled entity"
                            subtitle: modelData.kind || "Entity"
                            badgeInk: root.kindColor(modelData.kind)
                            placeholderIcon: root.kindIcon(modelData.kind)
                            checked: root.selected.some(item => item.id === modelData.id)
                            enabled: root.writable
                            preview: typeof mediaResolver !== "undefined" && mediaResolver && modelData.reference_images && modelData.reference_images.length ? referencePreview : null
                            Component {
                                id: referencePreview
                                MediaPreview {
                                    mediaKind: "image"
                                    locator: modelData.reference_images[0]
                                    showFilename: false
                                    fillPreview: true
                                }
                            }
                            onClicked: {
                                root.choose(modelData.id)
                                entityPicker.close()
                            }
                        }
                    }
                }
            }
            Ui.Text {
                visible: root.matches.length === 0
                text: root.loading ? "Loading…" : "No matching entities"
                role: Ui.Typography.SansCaption
            }
        }
    }
    RowLayout {
        visible: !root.entity
        Layout.fillWidth: true
        spacing: Ui.Metrics.xs
        Ui.Select {
            objectName: "remaining-select-" + root.descriptor.name
            Layout.fillWidth: true
            accessibleName: "Select " + root.kind
            enabled: root.writable && root.matches.length > 0
            options: root.matches.map(row => ({label: row.name + (row.portable ? " · portable" : ""), value: root.kind === "font" ? row.name : row.id}))
            value: root.value ? root.value[root.identity] : ""
            onValueCommitted: value => root.choose(value)
        }
        Ui.MenuButton {
            objectName: "folder-create-open"
            visible: root.kind === "folder"
            iconName: "createNewFolder"
            accessibleName: "Create folder"
            trailingIconName: ""
            enabled: root.writable && root.controller && !root.loading
            menu: folderPopover
        }
    }
    Ui.Popover {
        id: folderPopover
        contentItem: ColumnLayout {
            Ui.Text {
                text: "Create folder"
                role: Ui.Typography.SansLabel
            }
            Ui.TextField {
                accessibleName: "New folder name"
                placeholderText: accessibleName
                value: root.folderName
                onValuePreviewed: value => root.folderName = value
                onValueCommitted: value => root.folderName = value
            }
            RowLayout {
                NodeButton {
                    text: "Cancel"
                    onClicked: folderPopover.close()
                }
                NodeButton {
                    objectName: "remaining-create-folder"
                    text: "Create folder"
                    enabled: root.writable && root.controller && root.folderName.trim() !== "" && !root.loading
                    onClicked: {
                        folderPopover.close()
                        root.loading = true
                        root.controller.createFolder(root.key, root.value && root.value.asset_id || "", root.folderName)
                    }
                }
            }
        }
    }
    Ui.Text {
        Layout.fillWidth: true
        text: root.error || (root.loading ? "Loading…" : root.loaded && !root.matches.length ? "No matching resources." : !root.controller ? "Connect to a server to choose a resource." : "")
        visible: text !== ""
        tone: root.error ? Ui.Text.Error : Ui.Text.Secondary
        role: Ui.Typography.SansCaption
        wrapMode: Text.Wrap
    }
}
