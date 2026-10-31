pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Dialog {
    id: sheet
    objectName: "providerSettingsDialog"
    property ProviderSettings controller: ProviderSettings { objectName: "providerSettingsController" }
    property string pendingGroup: ""
    property string pendingRemoval: ""
    title: "Providers"
    width: Math.min(parent.width - Ui.Metrics.dialogNarrowInset * 2, Ui.Metrics.dialogWidth)
    height: Math.min(parent.height - Ui.Metrics.dialogNarrowInset * 2, Ui.Metrics.dialogWidth)
    modal: true
    focus: true
    closePolicy: Popup.NoAutoClose
    onOpened: controller.reload()
    onClosed: controller.discard()
    function reveal(control) {
        Qt.callLater(function() {
            if (!control || !control.activeFocus) return
            const viewport = scroller.contentItem
            const position = control.mapToItem(viewport, 0, 0)
            let next = viewport.contentY
            if (position.y < Ui.Metrics.border) next += position.y - Ui.Metrics.border
            else if (position.y + control.height > viewport.height - Ui.Metrics.border)
                next += position.y + control.height - viewport.height + Ui.Metrics.border
            viewport.contentY = Math.max(0, Math.min(next, Math.max(0, viewport.contentHeight - viewport.height)))
        })
    }
    function requestClose() {
        if (controller.busy) return
        pendingGroup = ""
        if (controller.dirty) discardDialog.open()
        else close()
    }
    function requestGroup(group) {
        if (group === controller.selectedGroup) return
        if (controller.dirty) {
            pendingGroup = group
            discardDialog.open()
        } else controller.selectGroup(group)
    }
    Shortcut {
        sequence: "Escape"
        context: Qt.WindowShortcut
        enabled: sheet.visible && !discardDialog.visible && !removeDialog.visible
        onActivated: sheet.requestClose()
    }
    contentItem: ColumnLayout {
        spacing: Ui.Metrics.md
        Ui.BusyIndicator {
            objectName: "providerSettingsLoading"
            Layout.alignment: Qt.AlignHCenter
            running: sheet.controller.busy
            visible: running
            Accessible.name: "Loading provider settings"
        }
        Ui.Text {
            objectName: "providerSettingsMessage"
            Layout.fillWidth: true
            visible: text.length > 0
            text: sheet.controller.message
            wrapMode: Text.WordWrap
            role: Ui.Typography.SansLabel
            Accessible.role: Accessible.AlertMessage
        }
        Ui.EditorButton {
            objectName: "retryProviderSettings"
            text: "Reload providers"
            enabled: !sheet.controller.busy && !sheet.controller.dirty
            onClicked: sheet.controller.reload()
        }
        Ui.Select {
            id: groupPicker
            objectName: "providerGroup"
            Layout.fillWidth: true
            options: sheet.controller.groups.map(group => ({label: group, value: group}))
            value: sheet.controller.selectedGroup
            enabled: !sheet.controller.busy && count > 0
            accessibleName: "Provider settings group"
            onValueCommitted: value => sheet.requestGroup(value)
        }
        ScrollView {
            id: scroller
            objectName: "providerSettingsScroll"
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            contentWidth: availableWidth
            ScrollBar.horizontal.policy: ScrollBar.AlwaysOff
            ScrollBar.vertical.active: true
            Column {
                width: scroller.availableWidth
                spacing: Ui.Metrics.lg
                Ui.Text {
                    width: parent.width
                    text: "Configure providers on the connected NodeTool server. Changes are saved only when you press Save."
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansLabel
                    tone: Ui.Text.Secondary
                }
                Repeater {
                    model: sheet.controller.fields
                    delegate: Column {
                        id: field
                        required property var modelData
                        width: parent.width
                        spacing: Ui.Metrics.xs
                        Ui.Text {
                            width: parent.width
                            text: field.modelData.key + (field.modelData.secret ? (field.modelData.unreadable ? " · Stored key needs replacement" : field.modelData.configured ? " · Configured" : " · Not configured") : "")
                            wrapMode: Text.WrapAnywhere
                            role: Ui.Typography.SansLabel
                        }
                        Ui.Text {
                            width: parent.width
                            text: field.modelData.description || ""
                            wrapMode: Text.WordWrap
                            role: Ui.Typography.SansCaption
                            tone: Ui.Text.Secondary
                        }
                        Ui.Text {
                            width: parent.width
                            visible: !!field.modelData.secret && !!field.modelData.configured && !field.modelData.removable
                            text: "Configured by the server environment. A replacement key stores an override for this account."
                            wrapMode: Text.WordWrap
                            role: Ui.Typography.SansCaption
                            tone: Ui.Text.Secondary
                        }
                        Ui.TextField {
                            id: input
                            objectName: "providerField_" + field.modelData.key
                            width: parent.width
                            visible: !field.modelData.options || field.modelData.options.length === 0
                            enabled: !sheet.controller.busy
                            value: field.modelData.secret ? "" : String(field.modelData.value || "")
                            placeholderText: field.modelData.secret && field.modelData.configured ? "Enter a replacement key" : ""
                            echoMode: field.modelData.secret ? TextInput.Password : TextInput.Normal
                            inputMethodHints: field.modelData.secret ? Qt.ImhSensitiveData | Qt.ImhNoPredictiveText : Qt.ImhNone
                            accessibleName: field.modelData.key
                            onActiveFocusChanged: { if (activeFocus) sheet.reveal(input) }
                            onValuePreviewed: value => sheet.controller.draft(field.modelData.key, value)
                            Connections {
                                target: sheet.controller
                                function onDraftsCleared() { input.text = field.modelData.secret ? "" : String(field.modelData.value || "") }
                            }
                        }
                        Ui.Select {
                            id: choice
                            objectName: "providerChoice_" + field.modelData.key
                            width: parent.width
                            visible: !!field.modelData.options && field.modelData.options.length > 0
                            enabled: !sheet.controller.busy
                            options: (field.modelData.options || []).map(value => ({label: value, value: value}))
                            value: String(field.modelData.value || "")
                            displayText: currentIndex < 0 ? "Not set" : currentText
                            accessibleName: field.modelData.key
                            onActiveFocusChanged: { if (activeFocus) sheet.reveal(choice) }
                            onValueCommitted: value => sheet.controller.draft(field.modelData.key, value)
                        }
                        Flow {
                            width: parent.width
                            spacing: Ui.Metrics.md
                            visible: !!field.modelData.secret
                            Ui.EditorButton {
                                id: testButton
                                objectName: "testProvider_" + field.modelData.key
                                text: "Test credential"
                                enabled: !sheet.controller.busy
                                onActiveFocusChanged: { if (activeFocus) sheet.reveal(testButton) }
                                onClicked: sheet.controller.test(field.modelData.key)
                            }
                            Ui.EditorButton {
                                id: removeButton
                                objectName: "removeProvider_" + field.modelData.key
                                text: "Remove stored key…"
                                enabled: !sheet.controller.busy && !sheet.controller.dirty && !!field.modelData.removable
                                onActiveFocusChanged: { if (activeFocus) sheet.reveal(removeButton) }
                                onClicked: { sheet.pendingRemoval = field.modelData.key; removeDialog.open() }
                            }
                        }
                    }
                }
                Ui.Text {
                    width: parent.width
                    visible: sheet.controller.fields.length === 0 && !sheet.controller.busy
                    text: "No editable provider settings are available for this server."
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansLabel
                    tone: Ui.Text.Secondary
                }
                Ui.EditorButton {
                    id: modelsButton
                    objectName: "checkProviderModels"
                    text: "Check saved models"
                    enabled: !sheet.controller.busy && !sheet.controller.dirty && sheet.controller.selectedGroup.length > 0
                    onActiveFocusChanged: { if (activeFocus) sheet.reveal(modelsButton) }
                    onClicked: sheet.controller.checkModels()
                }
                Ui.Text {
                    width: parent.width
                    text: "Save or discard edits before checking model availability."
                    visible: sheet.controller.dirty
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Ui.Text {
                    objectName: "providerTestMessage"
                    width: parent.width
                    visible: text.length > 0
                    text: sheet.controller.testMessage
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansLabel
                    Accessible.role: Accessible.AlertMessage
                }
                Ui.Text {
                    width: parent.width
                    text: "Testing contacts the provider to check the credential. Save or discard changes before removing a stored key."
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Ui.Text { text: "Provider availability"; role: Ui.Typography.SansLabel }
                Ui.Text {
                    width: parent.width
                    text: "Configured means required settings are present. It does not confirm the provider is reachable."
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Repeater {
                    model: sheet.controller.providers
                    delegate: Ui.Text {
                        required property var modelData
                        width: parent.width
                        text: (modelData.name || modelData.id || modelData.provider || "") + " · " + (modelData.configured ? "Configured" : "Not configured")
                        wrapMode: Text.WordWrap
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                }
            }
        }
        Ui.Text {
            Layout.fillWidth: true
            visible: sheet.controller.dirty
            text: "Unsaved changes"
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Warning
        }
        Flow {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Ui.EditorButton {
                objectName: "cancelProviderSettings"
                text: "Close"
                enabled: !sheet.controller.busy
                onClicked: sheet.requestClose()
            }
            Ui.EditorButton {
                objectName: "saveProviderSettings"
                text: sheet.controller.busy ? "Working…" : "Save"
                enabled: !sheet.controller.busy && sheet.controller.dirty
                onClicked: sheet.controller.save()
            }
        }
    }
    Ui.Dialog {
        id: discardDialog
        objectName: "discardProviderDrafts"
        width: Math.max(0, Math.min(sheet.width - Ui.Metrics.xl, Ui.Metrics.dialogWidth / 2))
        implicitHeight: Ui.Metrics.touch * 4
        title: "Discard unsaved changes?"
        modal: true
        focus: true
        standardButtons: Dialog.Discard | Dialog.Cancel
        contentItem: Ui.Text {
            id: discardBody
            role: Ui.Typography.SansLabel
            text: "Your provider changes have not been saved."
            wrapMode: Text.WordWrap
        }
        onDiscarded: {
            sheet.controller.discard()
            close()
            if (sheet.pendingGroup) sheet.controller.selectGroup(sheet.pendingGroup)
            else sheet.close()
            sheet.pendingGroup = ""
        }
        onRejected: {
            sheet.pendingGroup = ""
            groupPicker.synchronize()
        }
    }
    Ui.Dialog {
        id: removeDialog
        objectName: "confirmProviderRemoval"
        width: Math.max(0, Math.min(sheet.width - Ui.Metrics.xl, Ui.Metrics.dialogWidth / 2))
        implicitHeight: Ui.Metrics.touch * 4
        title: "Remove stored key?"
        modal: true
        focus: true
        standardButtons: Dialog.Yes | Dialog.Cancel
        contentItem: Ui.Text {
            id: removeBody
            role: Ui.Typography.SansLabel
            text: "Remove " + sheet.pendingRemoval + " from this account's secret store? A server environment key, if present, will still apply."
            wrapMode: Text.WordWrap
        }
        onAccepted: { sheet.controller.remove(sheet.pendingRemoval); sheet.pendingRemoval = "" }
        onRejected: sheet.pendingRemoval = ""
    }
}
