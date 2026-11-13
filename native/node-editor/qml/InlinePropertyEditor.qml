import QtQuick
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    required property var presenter
    required property int activationToken
    // The pickers the card's model, document and resource selects use.
    required property PropertyHost host
    readonly property var descriptor: presenter.descriptor
    readonly property int token: activationToken
    readonly property var value: descriptor.hasValue ? descriptor.value : descriptor.hasDefault ? descriptor.defaultValue : null
    readonly property string kind: descriptor.kind || ""
    readonly property bool structured: ["list", "dict", "json", "record_type"].includes(kind) || table
    // The constant List and Dict cards edit through the web's table, as the inspector does.
    readonly property bool table: (kind === "list" && descriptor.nodeType === "nodetool.constant.List") || (kind === "dict" && descriptor.nodeType === "nodetool.constant.Dict")
    readonly property bool resource: ["workflow", "workflow_list", "collection"].includes(kind)
    readonly property bool imageSize: kind === "image_size"
    function commit(value) { presenter.commit(value, token) }
    function cancel() { presenter.cancel() }
    function finish() { if (loader.item && loader.item.finishEdit) loader.item.finishEdit() }
    function activate() {
        if (!loader.item) return
        if (loader.item.focusEditor) loader.item.focusEditor()
        else loader.item.forceActiveFocus(Qt.MouseFocusReason)
        if (kind === "boolean") commit(!value)
        if (kind === "choice") loader.item.popup.open()
        if (kind === "model" || resource) loader.item.openPicker()
        if (kind === "document_ref") loader.item.openPicker()
    }
    function maskPopup() {
        if (!loader.item || !loader.item.popup || !loader.item.popup.visible) {
            presenter.popupRect(Qt.rect(0,0,0,0)); return
        }
        const content = loader.item.popup.contentItem.parent || loader.item.popup.contentItem
        const top = content.mapToItem(root, 0, 0)
        const bottom = content.mapToItem(root, content.width, content.height)
        presenter.popupRect(Qt.rect(top.x, top.y, bottom.x-top.x, bottom.y-top.y))
    }
    Keys.priority: Keys.AfterItem
    Keys.onPressed: event => {
        if (event.key === Qt.Key_Escape) { root.cancel(); event.accepted = true }
    }
    Item {
        id: card
        x: root.presenter.editorRect.x
        y: root.presenter.editorRect.y
        width: root.presenter.editorRect.width / root.presenter.zoom
        height: root.presenter.editorRect.height / root.presenter.zoom
        scale: root.presenter.zoom
        transformOrigin: Item.TopLeft
        Loader {
            id: loader
            width: parent.width
            height: parent.height - (root.kind === "text" || root.kind === "multiline" ? Ui.Metrics.small : 0)
            sourceComponent: root.descriptor.name === "code" ? codeEditor : root.kind === "boolean" ? booleanEditor : root.kind === "choice" ? choiceEditor
                : root.kind === "model" ? modelEditor
                : root.structured ? structuredEditor
                : root.imageSize ? imageSizeEditor
                : root.kind === "document_ref" ? documentEditor
                : root.resource ? resourceEditor
                : root.kind === "number" || root.kind === "integer" ? numberEditor
                : multilineEditor
        }
        Ui.EditorButton {
            objectName: "inline-expand"
            visible: root.kind === "text" || root.kind === "multiline"
            x: parent.width - width
            y: loader.height
            implicitHeight: Ui.Metrics.small
            density: Ui.EditorButton.Compact
            focusPolicy: Qt.NoFocus
            text: root.presenter.expanded ? "Collapse" : "Expand"
            onClicked: root.presenter.expand()
        }
    }
    component FieldFrame: Rectangle {
        property bool invalid: false
        color: Ui.Theme.surfaceInput
        radius: Ui.Metrics.radiusControl
        border.width: Ui.Metrics.focus
        border.color: invalid ? Ui.Theme.borderError : Ui.Theme.borderFocus
    }
    Component {
        id: codeEditor
        CodePropertyEditor {
            value: typeof root.value === "string" ? root.value : ""
            nodeType: root.descriptor.nodeType || ""
            writable: true
            onValueCommitted: value => root.commit(value)
            onEditCanceled: root.cancel()
        }
    }
    Component {
        id: multilineEditor
        Ui.TextArea {
            objectName: root.kind === "text" && !root.presenter.expanded ? "inline-text" : "inline-multiline"
            value: typeof root.value === "string" ? root.value : ""
            placeholderText: root.value === null ? "Not set" : ""
            accessibleName: root.descriptor.label || root.descriptor.name || ""
            role: Ui.Typography.MonoCaption
            wrapMode: root.kind === "multiline" || root.presenter.expanded ? TextEdit.Wrap : TextEdit.NoWrap
            background: FieldFrame {}
            onValueCommitted: value => root.commit(value)
            onEditCanceled: root.cancel()
            Keys.priority: Keys.BeforeItem
            Keys.onPressed: event => {
                if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && ((root.kind === "text" && !root.presenter.expanded) || (event.modifiers & Qt.ControlModifier))) {
                    finishEdit(); event.accepted = true
                } else if (event.key === Qt.Key_Escape) { cancelEdit(); root.cancel(); event.accepted = true }
            }
        }
    }
    Component {
        id: numberEditor
        Ui.NumberField {
            objectName: "inline-number"
            // The card row is shorter than the standard field, so the text sits in the middle without padding.
            topPadding: 0
            bottomPadding: 0
            verticalAlignment: TextInput.AlignVCenter
            value: typeof root.value === "number" ? root.value : 0
            displayValue: typeof root.value === "number" ? String(root.value) : ""
            from: typeof root.descriptor.min === "number" ? root.descriptor.min : -Infinity
            to: typeof root.descriptor.max === "number" ? root.descriptor.max : Infinity
            stepSize: typeof root.descriptor.step === "number" ? root.descriptor.step : 1
            accessibleName: root.descriptor.label || root.descriptor.name || ""
            valid: root.kind !== "integer" || text.trim() === "" || Number.isInteger(Number(text))
            errorText: root.kind === "integer" ? "Enter a whole number within the allowed range." : "Enter a number within the allowed range."
            background: FieldFrame { invalid: !parent.valid || !parent.draftValid }
            onValueCommitted: value => root.commit(value)
            onEditCanceled: root.cancel()
        }
    }
    Component {
        id: booleanEditor
        Ui.CheckBox {
            objectName: "inline-boolean"
            text: ""
            checked: root.value === true
            accessibleName: root.descriptor.label || root.descriptor.name || ""
            onCheckedChangedByUser: checked => root.commit(checked)
        }
    }
    Component {
        id: modelEditor
        // The card's model chip opens the shared picker that the inspector uses.
        ModelPropertyEditor {
            objectName: "inline-model"
            controller: root.host.modelPicker
            descriptor: root.descriptor
            value: root.value
            writable: true
            onValueCommitted: value => root.commit(value)
            popup.onOpened: Qt.callLater(root.maskPopup)
            popup.onClosed: Qt.callLater(root.maskPopup)
        }
    }
    Component {
        id: structuredEditor
        // The web's ListTable, DictTable, ColumnsManager and JSON editor on the
        // card. Each change applies at once and the panel stays open.
        Rectangle {
            id: panel
            objectName: "inline-structured"
            readonly property real wanted: Math.min(editor.implicitContent + Ui.Metrics.md * 2, Ui.Metrics.touch * 10)
            color: Ui.Theme.surfaceOverlay
            radius: Ui.Metrics.radiusOverlay
            border.width: Ui.Metrics.border
            border.color: Ui.Theme.borderControl
            function finishEdit() {
                // A blur commits a typed entry before the panel closes.
                panel.forceActiveFocus()
                root.presenter.close(root.token)
            }
            onWantedChanged: root.presenter.setContentHeight(wanted)
            Component.onCompleted: root.presenter.setContentHeight(wanted)
            Flickable {
                anchors.fill: parent
                anchors.margins: Ui.Metrics.md
                clip: true
                contentWidth: width
                contentHeight: editor.implicitContent
                boundsBehavior: Flickable.StopAtBounds
                Loader {
                    id: editor
                    width: parent.width
                    readonly property real implicitContent: item ? item.implicitHeight : 0
                    sourceComponent: root.table ? tableBody : root.kind === "record_type" ? recordTypeBody : structuredBody
                }
                Component {
                    id: structuredBody
                    StructuredPropertyEditor {
                        descriptor: root.descriptor
                        value: root.value
                        writable: true
                        onValueCommitted: value => root.presenter.apply(value, root.token)
                    }
                }
                Component {
                    id: tableBody
                    DataTableEditor {
                        descriptor: root.descriptor
                        value: root.value
                        writable: true
                        onValueCommitted: value => root.presenter.apply(value, root.token)
                    }
                }
                Component {
                    id: recordTypeBody
                    RecordTypeEditor {
                        descriptor: root.descriptor
                        value: root.value
                        writable: true
                        onValueCommitted: value => root.presenter.apply(value, root.token)
                    }
                }
            }
        }
    }
    Component {
        id: documentEditor
        // The card's document select opens the shared picker that the inspector uses.
        DocumentPropertyEditor {
            objectName: "inline-document"
            controller: root.host.documentPicker
            descriptor: root.descriptor
            value: root.value
            writable: true
            nodeId: root.descriptor.nodeType || ""
            showOpen: false
            onValueCommitted: value => root.commit(value)
            Binding { target: popup; property: "scale"; value: root.presenter.zoom }
            Connections {
                target: popup
                function onOpened() { Qt.callLater(root.maskPopup) }
                function onClosed() { Qt.callLater(root.maskPopup) }
            }
        }
    }
    Component {
        id: imageSizeEditor
        // ImageSizeProperty.tsx on the card: the width and height fields with the
        // swap, lock and preset controls. Each change applies at once.
        Rectangle {
            id: sizePanel
            objectName: "inline-image-size"
            readonly property real wanted: sizeEditor.implicitHeight + Ui.Metrics.md * 2
            color: Ui.Theme.surfaceOverlay
            radius: Ui.Metrics.radiusOverlay
            border.width: Ui.Metrics.border
            border.color: Ui.Theme.borderControl
            function finishEdit() {
                sizePanel.forceActiveFocus()
                root.presenter.close(root.token)
            }
            onWantedChanged: root.presenter.setContentHeight(wanted)
            Component.onCompleted: root.presenter.setContentHeight(wanted)
            ImageSizePropertyEditor {
                id: sizeEditor
                anchors.fill: parent
                anchors.margins: Ui.Metrics.md
                descriptor: root.descriptor
                value: root.value
                writable: true
                onValueCommitted: value => root.presenter.apply(value, root.token)
            }
        }
    }
    Component {
        id: resourceEditor
        // WorkflowProperty, WorkflowListProperty and CollectionProperty selects.
        // A list choice toggles one workflow and the select stays open.
        Ui.Select {
            id: chooser
            objectName: "inline-resource-select"
            readonly property bool listMode: root.kind === "workflow_list"
            readonly property bool collectionMode: root.kind === "collection"
            readonly property var controller: root.host.resourcePicker
            readonly property string requestKey: "inline-resource-" + root.token
            readonly property var reference: root.value && typeof root.value === "object" && root.value.length === undefined ? root.value : ({})
            readonly property var selected: listMode && root.value && typeof root.value.length === "number" && typeof root.value !== "string" ? Array.from(root.value) : []
            readonly property var selectedIds: new Set(selected.filter(item => item && item.id).map(item => item.id))
            readonly property var names: new Map(rows.map(row => [collectionMode ? row.name : row.id, row.name]))
            property var rows: []
            property string chosen: ""
            property string error: ""
            options: rows.map(row => collectionMode ? ({label: row.name, value: row.name})
                : ({label: (listMode && selectedIds.has(row.id) ? "\u2713 " : "") + row.name, value: row.id}))
            value: listMode ? chosen : collectionMode ? (reference.name || "") : (reference.id || "")
            displayText: error !== "" ? error : !controller ? (collectionMode ? "Connect to a server to choose a collection." : "Connect to a server to choose a workflow.")
                : listMode ? selected.map(item => item && item.id ? names.get(item.id) || item.id : "").filter(Boolean).join(", ")
                : currentIndex >= 0 ? currentText : names.get(value) || value
            accessibleName: root.descriptor.label || root.descriptor.name || ""
            popup.scale: root.presenter.zoom
            popup.onOpened: Qt.callLater(root.maskPopup)
            popup.onClosed: Qt.callLater(root.maskPopup)
            function load(cursor) {
                if (!controller) return
                error = ""
                if (collectionMode) controller.collections(requestKey)
                else controller.workflows(requestKey, cursor)
            }
            function openPicker() { rows = []; load("") }
            // ComboBox can move its index after the options change, so the
            // list opens on the stored value once that has settled.
            function present() { synchronize(); popup.open() }
            function finishEdit() { root.presenter.close(root.token) }
            onValueCommitted: value => {
                if (collectionMode) root.commit(Object.assign({}, reference, {type: "collection", name: value}))
                else if (!listMode) root.commit(Object.assign({}, reference, {type: "workflow", id: value}))
                else {
                    chosen = value
                    root.presenter.apply(selectedIds.has(value) ? selected.filter(item => !item || item.id !== value)
                        : selected.concat([{type: "workflow", id: value}]), root.token)
                }
            }
            Component.onDestruction: if (controller) controller.cancel(requestKey)
            Connections {
                target: chooser.controller
                function onListed(key, resources, next) {
                    if (key !== chooser.requestKey) return
                    const known = new Set(chooser.rows.map(row => row.id))
                    chooser.rows = chooser.rows.concat(resources.filter(row => !known.has(row.id)))
                    // The web lists the first 200 workflows.
                    if (next && chooser.rows.length < 200) chooser.load(next)
                    else Qt.callLater(chooser.present)
                }
                function onCollectionsListed(key, resources) {
                    if (key !== chooser.requestKey) return
                    chooser.rows = resources
                    Qt.callLater(chooser.present)
                }
                function onFailed(key, message) { if (key === chooser.requestKey) chooser.error = message }
            }
        }
    }
    Component {
        id: choiceEditor
        Ui.Select {
            id: selector
            objectName: "inline-choice"
            value: root.value
            options: root.descriptor.options || []
            accessibleName: root.descriptor.label || root.descriptor.name || ""
            onValueCommitted: value => root.commit(value)
            popup.scale: root.presenter.zoom
            popup.onOpened: Qt.callLater(root.maskPopup)
            popup.onClosed: Qt.callLater(root.maskPopup)
        }
    }
}
