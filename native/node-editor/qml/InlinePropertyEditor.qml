import QtQuick
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    required property var presenter
    required property int activationToken
    readonly property var descriptor: presenter.descriptor
    readonly property int token: activationToken
    readonly property var value: descriptor.hasValue ? descriptor.value : descriptor.hasDefault ? descriptor.defaultValue : null
    readonly property string kind: descriptor.kind || ""
    function commit(value) { presenter.commit(value, token) }
    function cancel() { presenter.cancel() }
    function finish() { if (loader.item && loader.item.finishEdit) loader.item.finishEdit() }
    function activate() {
        if (!loader.item) return
        if (loader.item.focusEditor) loader.item.focusEditor()
        else loader.item.forceActiveFocus(Qt.MouseFocusReason)
        if (kind === "boolean") commit(!value)
        if (kind === "choice") loader.item.popup.open()
        if (kind === "model") loader.item.openPicker()
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
            descriptor: root.descriptor
            value: root.value
            writable: true
            onValueCommitted: value => root.commit(value)
            popup.onOpened: Qt.callLater(root.maskPopup)
            popup.onClosed: Qt.callLater(root.maskPopup)
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
