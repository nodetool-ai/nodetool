pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline

Dialog {
    id: sheet
    objectName: "providerSettingsDialog"
    property ProviderSettings controller: ProviderSettings { objectName: "providerSettingsController" }
    property string pendingGroup: ""
    property string pendingRemoval: ""
    title: "Providers"
    anchors.centerIn: parent
    width: Math.min(parent.width - Theme.spacingXl * 2, Theme.trackHeaderWidth * 2)
    height: Math.min(parent.height - Theme.spacingXl * 2, Theme.trackHeight * 9)
    modal: true
    focus: true
    padding: Theme.spacingXl
    closePolicy: Popup.NoAutoClose
    palette.window: Theme.backgroundPaper
    palette.windowText: Theme.textPrimary
    palette.text: Theme.textPrimary
    palette.button: Theme.backgroundDefault
    palette.buttonText: Theme.textPrimary
    palette.base: Theme.backgroundDefault
    palette.highlight: Theme.primary
    font.family: Theme.sansFamily
    font.pixelSize: Theme.fontSizeSmall
    background: Rectangle { color: Theme.backgroundPaper; border.color: Theme.divider; radius: Theme.radiusLg }
    onOpened: controller.reload()
    onClosed: controller.discard()
    function reveal(control) {
        Qt.callLater(function() {
            if (!control || !control.activeFocus) return
            const viewport = scroller.contentItem
            const position = control.mapToItem(viewport, 0, 0)
            let next = viewport.contentY
            if (position.y < 0) next += position.y
            else if (position.y + control.height > viewport.height) next += position.y + control.height - viewport.height
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
    header: Label {
        text: sheet.title
        padding: Theme.spacingXl
        color: Theme.textPrimary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeNormal
        font.weight: Font.DemiBold
    }
    contentItem: ColumnLayout {
        spacing: Theme.spacingMd
        Label {
            Layout.fillWidth: true
            text: "Configure providers on the connected NodeTool server. Changes are saved only when you press Save."
            wrapMode: Text.WordWrap
            color: Theme.textSecondary
        }
        BusyIndicator {
            objectName: "providerSettingsLoading"
            Layout.alignment: Qt.AlignHCenter
            running: sheet.controller.busy
            visible: running
            Accessible.name: "Loading provider settings"
        }
        Label {
            objectName: "providerSettingsMessage"
            Layout.fillWidth: true
            visible: text.length > 0
            text: sheet.controller.message
            wrapMode: Text.WordWrap
            color: Theme.textPrimary
            Accessible.role: Accessible.AlertMessage
        }
        Button {
            objectName: "retryProviderSettings"
            text: "Reload providers"
            enabled: !sheet.controller.busy && !sheet.controller.dirty
            onClicked: sheet.controller.reload()
        }
        ComboBox {
            id: groupPicker
            objectName: "providerGroup"
            Layout.fillWidth: true
            model: sheet.controller.groups
            currentIndex: Math.max(0, sheet.controller.groups.indexOf(sheet.controller.selectedGroup))
            enabled: !sheet.controller.busy && count > 0
            Accessible.name: "Provider settings group"
            onActivated: sheet.requestGroup(currentText)
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
                spacing: Theme.spacingLg
                Repeater {
                    model: sheet.controller.fields
                    delegate: Column {
                        id: field
                        required property var modelData
                        width: parent.width
                        spacing: Theme.spacingXs
                        Label {
                            width: parent.width
                            text: field.modelData.key + (field.modelData.secret ? (field.modelData.unreadable ? " · Stored key needs replacement" : field.modelData.configured ? " · Configured" : " · Not configured") : "")
                            wrapMode: Text.WrapAnywhere
                            color: Theme.textPrimary
                            font.weight: Font.Medium
                        }
                        Label {
                            width: parent.width
                            text: field.modelData.description || ""
                            wrapMode: Text.WordWrap
                            color: Theme.textSecondary
                        }
                        Label {
                            width: parent.width
                            visible: !!field.modelData.secret && !!field.modelData.configured && !field.modelData.removable
                            text: "Configured by the server environment. A replacement key stores an override for this account."
                            wrapMode: Text.WordWrap
                            color: Theme.textSecondary
                        }
                        TextField {
                            id: input
                            objectName: "providerField_" + field.modelData.key
                            width: parent.width
                            visible: !field.modelData.options || field.modelData.options.length === 0
                            enabled: !sheet.controller.busy
                            text: field.modelData.secret ? "" : String(field.modelData.value || "")
                            placeholderText: field.modelData.secret && field.modelData.configured ? "Enter a replacement key" : ""
                            echoMode: field.modelData.secret ? TextInput.Password : TextInput.Normal
                            inputMethodHints: field.modelData.secret ? Qt.ImhSensitiveData | Qt.ImhNoPredictiveText : Qt.ImhNone
                            selectByMouse: true
                            color: Theme.textPrimary
                            selectionColor: Theme.primary
                            selectedTextColor: Theme.textPrimary
                            Accessible.name: field.modelData.key
                            onActiveFocusChanged: { if (activeFocus) sheet.reveal(input) }
                            onTextEdited: sheet.controller.draft(field.modelData.key, text)
                            background: Rectangle {
                                color: Theme.backgroundDefault
                                radius: Theme.radiusSm
                                border.color: input.activeFocus ? Theme.primary : Theme.divider
                                border.width: Theme.spacingMicro
                            }
                            Connections {
                                target: sheet.controller
                                function onDraftsCleared() { input.text = field.modelData.secret ? "" : String(field.modelData.value || "") }
                            }
                        }
                        ComboBox {
                            id: choice
                            objectName: "providerChoice_" + field.modelData.key
                            width: parent.width
                            visible: !!field.modelData.options && field.modelData.options.length > 0
                            enabled: !sheet.controller.busy
                            model: field.modelData.options || []
                            currentIndex: model.indexOf(String(field.modelData.value || ""))
                            displayText: currentIndex < 0 ? "Not set" : currentText
                            Accessible.name: field.modelData.key
                            onActiveFocusChanged: { if (activeFocus) sheet.reveal(choice) }
                            onActivated: sheet.controller.draft(field.modelData.key, currentText)
                        }
                        Flow {
                            width: parent.width
                            spacing: Theme.spacingMd
                            visible: !!field.modelData.secret
                            Button {
                                id: testButton
                                objectName: "testProvider_" + field.modelData.key
                                text: "Test credential"
                                enabled: !sheet.controller.busy
                                onActiveFocusChanged: { if (activeFocus) sheet.reveal(testButton) }
                                onClicked: sheet.controller.test(field.modelData.key)
                            }
                            Button {
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
                Label {
                    width: parent.width
                    visible: sheet.controller.fields.length === 0 && !sheet.controller.busy
                    text: "No editable provider settings are available for this server."
                    wrapMode: Text.WordWrap
                    color: Theme.textSecondary
                }
                Button {
                    id: modelsButton
                    objectName: "checkProviderModels"
                    text: "Check saved models"
                    enabled: !sheet.controller.busy && !sheet.controller.dirty && sheet.controller.selectedGroup.length > 0
                    onActiveFocusChanged: { if (activeFocus) sheet.reveal(modelsButton) }
                    onClicked: sheet.controller.checkModels()
                }
                Label {
                    width: parent.width
                    text: "Save or discard edits before checking model availability."
                    visible: sheet.controller.dirty
                    wrapMode: Text.WordWrap
                    color: Theme.textSecondary
                }
                Label {
                    objectName: "providerTestMessage"
                    width: parent.width
                    visible: text.length > 0
                    text: sheet.controller.testMessage
                    wrapMode: Text.WordWrap
                    color: Theme.textPrimary
                    Accessible.role: Accessible.AlertMessage
                }
                Label {
                    width: parent.width
                    text: "Testing contacts the provider to check the credential. Save or discard changes before removing a stored key."
                    wrapMode: Text.WordWrap
                    color: Theme.textSecondary
                }
                Label { text: "Provider availability"; color: Theme.textPrimary; font.weight: Font.Medium }
                Label {
                    width: parent.width
                    text: "Configured means required settings are present. It does not confirm the provider is reachable."
                    wrapMode: Text.WordWrap
                    color: Theme.textSecondary
                }
                Repeater {
                    model: sheet.controller.providers
                    delegate: Label {
                        required property var modelData
                        width: parent.width
                        text: (modelData.name || modelData.id || modelData.provider || "") + " · " + (modelData.configured ? "Configured" : "Not configured")
                        wrapMode: Text.WordWrap
                        color: Theme.textSecondary
                    }
                }
            }
        }
        Label {
            Layout.fillWidth: true
            visible: sheet.controller.dirty
            text: "Unsaved changes"
            color: Theme.warning
        }
        Flow {
            Layout.fillWidth: true
            spacing: Theme.spacingMd
            Button {
                objectName: "cancelProviderSettings"
                text: "Close"
                enabled: !sheet.controller.busy
                onClicked: sheet.requestClose()
            }
            Button {
                objectName: "saveProviderSettings"
                text: sheet.controller.busy ? "Working…" : "Save"
                enabled: !sheet.controller.busy && sheet.controller.dirty
                onClicked: sheet.controller.save()
            }
        }
    }
    Dialog {
        id: discardDialog
        objectName: "discardProviderDrafts"
        anchors.centerIn: parent
        width: Math.min(sheet.width - Theme.spacingXl, Theme.trackHeaderWidth)
        title: "Discard unsaved changes?"
        implicitHeight: discardBody.implicitHeight + Theme.spacingXl * 2 + Theme.toolbarHeight * 2
        modal: true
        focus: true
        standardButtons: Dialog.Discard | Dialog.Cancel
        contentItem: Text {
            id: discardBody
            width: discardDialog.availableWidth
            color: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
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
            groupPicker.currentIndex = Qt.binding(function() { return Math.max(0, sheet.controller.groups.indexOf(sheet.controller.selectedGroup)) })
        }
    }
    Dialog {
        id: removeDialog
        objectName: "confirmProviderRemoval"
        anchors.centerIn: parent
        width: Math.min(sheet.width - Theme.spacingXl, Theme.trackHeaderWidth)
        title: "Remove stored key?"
        implicitHeight: removeBody.implicitHeight + Theme.spacingXl * 2 + Theme.toolbarHeight * 2
        modal: true
        focus: true
        standardButtons: Dialog.Yes | Dialog.Cancel
        contentItem: Text {
            id: removeBody
            width: removeDialog.availableWidth
            color: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            text: "Remove " + sheet.pendingRemoval + " from this account's secret store? A server environment key, if present, will still apply."
            wrapMode: Text.WordWrap
        }
        onAccepted: { sheet.controller.remove(sheet.pendingRemoval); sheet.pendingRemoval = "" }
        onRejected: sheet.pendingRemoval = ""
    }
}
