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
    onOpened: { groupPicked = false; controller.reload() }
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
        groupPicked = true
        if (controller.dirty) {
            pendingGroup = group
            discardDialog.open()
        } else controller.selectGroup(group)
    }
    // Open on a ready provider until the user picks one.
    Connections {
        target: sheet.controller
        function onFieldsChanged() {
            const first = sheet.visibleGroups[0]
            if (!sheet.groupPicked && !sheet.controller.dirty && first && first !== sheet.controller.selectedGroup
                    && sheet.providerFor(first).configured && !sheet.activeProvider.configured)
                Qt.callLater(() => sheet.controller.selectGroup(first))
        }
    }
    Shortcut {
        sequence: "Escape"
        context: Qt.WindowShortcut
        enabled: sheet.visible && !discardDialog.visible && !removeDialog.visible
        onActivated: sheet.requestClose()
    }
    function providerFor(group) {
        return controller.providers.find(p => p.name === group || (p.name + " (" + p.provider + ")") === group) || ({})
    }
    readonly property var activeProvider: providerFor(controller.selectedGroup)
    property string groupFilter: ""
    property bool groupPicked: false
    // Ready providers first, then the rest. Each part keeps the server order.
    readonly property var visibleGroups: {
        const query = groupFilter.trim().toLowerCase()
        const shown = controller.groups.filter(group => group.toLowerCase().includes(query))
        return shown.filter(group => providerFor(group).configured).concat(shown.filter(group => !providerFor(group).configured))
    }
    contentItem: ColumnLayout {
        spacing: Ui.Metrics.lg
        Ui.InspectorCard {
            Layout.fillWidth: true
            visible: sheet.controller.message.length > 0
            RowLayout {
                width: parent.width
                spacing: Ui.Metrics.md
                Ui.Icon { Layout.alignment: Qt.AlignTop; name: "info"; tone: Ui.Text.Info }
                Ui.Text {
                    objectName: "providerSettingsMessage"
                    Layout.fillWidth: true
                    text: sheet.controller.message
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansBody
                    Accessible.role: Accessible.AlertMessage
                }
                Ui.EditorButton {
                    text: "Reload"
                    visible: !sheet.controller.dirty
                    enabled: !sheet.controller.busy
                    onClicked: sheet.controller.reload()
                }
            }
        }
        Ui.BusyIndicator {
            Layout.alignment: Qt.AlignCenter
            Layout.fillHeight: true
            running: sheet.controller.busy && sheet.controller.groups.length === 0
            visible: running
            Accessible.name: "Loading providers"
        }
        Ui.EmptyState {
            Layout.fillWidth: true
            Layout.fillHeight: true
            visible: sheet.controller.groups.length === 0 && !sheet.controller.busy
            title: "No providers to show"
            message: "Connect to a NodeTool server to set up providers and API keys."
        }
        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            visible: sheet.controller.groups.length > 0
            spacing: Ui.Metrics.lg
            ColumnLayout {
                Layout.preferredWidth: Math.min(Ui.Metrics.xxxl * 6, sheet.width * 0.34)
                Layout.maximumWidth: Layout.preferredWidth
                Layout.fillHeight: true
                spacing: Ui.Metrics.md
                Ui.TextField {
                    objectName: "providerFilter"
                    Layout.fillWidth: true
                    placeholderText: "Filter providers"
                    accessibleName: "Filter providers"
                    onValuePreviewed: value => sheet.groupFilter = value
                }
                ListView {
                    id: groupPicker
                    objectName: "providerGroup"
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    spacing: Ui.Metrics.micro
                    activeFocusOnTab: true
                    keyNavigationEnabled: false
                    model: sheet.visibleGroups
                    currentIndex: sheet.visibleGroups.indexOf(sheet.controller.selectedGroup)
                    readonly property string currentText: sheet.controller.selectedGroup
                    Accessible.role: Accessible.List
                    Accessible.name: "Providers"
                    function synchronize() { currentIndex = Qt.binding(() => sheet.visibleGroups.indexOf(sheet.controller.selectedGroup)) }
                    function step(delta) {
                        const next = Math.max(0, Math.min(count - 1, currentIndex + delta))
                        if (next !== currentIndex) sheet.requestGroup(sheet.visibleGroups[next])
                    }
                    Keys.onUpPressed: step(-1)
                    Keys.onDownPressed: step(1)
                    delegate: Ui.ListRow {
                        id: row
                        required property string modelData
                        required property int index
                        readonly property var provider: sheet.providerFor(modelData)
                        width: ListView.view.width
                        active: ListView.isCurrentItem
                        focusPolicy: Qt.NoFocus
                        enabled: !sheet.controller.busy
                        accessibleName: modelData + (provider.configured ? ", ready" : ", needs setup")
                        onClicked: { groupPicker.forceActiveFocus(); sheet.requestGroup(modelData) }
                        Row {
                            spacing: Ui.Metrics.md
                            width: row.availableWidth
                            Ui.ProviderIcon {
                                anchors.verticalCenter: parent.verticalCenter
                                entry: row.provider.provider || row.modelData.toLowerCase()
                                size: Ui.Metrics.iconMd
                            }
                            Column {
                                width: parent.width - Ui.Metrics.iconMd - Ui.Metrics.md
                                Ui.Text { width: parent.width; text: row.modelData; elide: Text.ElideRight; role: Ui.Typography.SansLabel }
                                Ui.Text {
                                    width: parent.width
                                    text: row.provider.configured ? "Ready" : "Needs setup"
                                    role: Ui.Typography.SansCaption
                                    tone: row.provider.configured ? Ui.Text.Success : Ui.Text.Secondary
                                }
                            }
                        }
                    }
                }
            }
            Ui.Separator { Layout.fillHeight: true; orientation: Qt.Vertical }
            ColumnLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: Ui.Metrics.lg
                RowLayout {
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.md
                    visible: sheet.controller.selectedGroup.length > 0
                    Ui.ProviderIcon {
                        entry: sheet.activeProvider.provider || sheet.controller.selectedGroup.toLowerCase()
                        size: Ui.Metrics.iconLg
                    }
                    Ui.Text {
                        Layout.fillWidth: true
                        text: sheet.controller.selectedGroup
                        elide: Text.ElideRight
                        role: Ui.Typography.SansTitle
                    }
                    Ui.Status {
                        status: sheet.activeProvider.configured ? Ui.Status.Success : Ui.Status.Warning
                        message: sheet.activeProvider.configured ? "Ready" : "Needs setup"
                    }
                }
                Ui.BusyIndicator {
                    objectName: "providerSettingsLoading"
                    Layout.alignment: Qt.AlignHCenter
                    running: sheet.controller.busy
                    visible: running
                    Accessible.name: "Loading provider settings"
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
                        spacing: Ui.Metrics.xl
                        Repeater {
                            model: sheet.controller.fields
                            delegate: Column {
                                id: field
                                required property var modelData
                                readonly property bool secret: !!modelData.secret
                                readonly property bool envOnly: secret && !!modelData.configured && !modelData.removable
                                width: parent.width
                                spacing: Ui.Metrics.sm
                                RowLayout {
                                    width: parent.width
                                    spacing: Ui.Metrics.md
                                    Ui.Text {
                                        Layout.fillWidth: true
                                        text: field.modelData.key
                                        wrapMode: Text.WrapAnywhere
                                        role: Ui.Typography.MonoLabel
                                    }
                                    Ui.Text {
                                        visible: field.secret
                                        text: field.modelData.unreadable ? "Replace key" : field.envOnly ? "From server" : field.modelData.configured ? "Saved" : "Not set"
                                        role: Ui.Typography.SansCaption
                                        tone: field.modelData.unreadable ? Ui.Text.Error : field.modelData.configured ? Ui.Text.Success : Ui.Text.Secondary
                                    }
                                }
                                RowLayout {
                                    width: parent.width
                                    spacing: Ui.Metrics.md
                                    Ui.TextField {
                                        id: input
                                        objectName: "providerField_" + field.modelData.key
                                        Layout.fillWidth: true
                                        visible: !field.modelData.options || field.modelData.options.length === 0
                                        enabled: !sheet.controller.busy
                                        value: field.secret ? "" : String(field.modelData.value || "")
                                        placeholderText: field.secret ? (field.modelData.configured ? "••••••••  Paste a new key to replace" : "Paste your API key") : ""
                                        echoMode: field.secret ? TextInput.Password : TextInput.Normal
                                        inputMethodHints: field.secret ? Qt.ImhSensitiveData | Qt.ImhNoPredictiveText : Qt.ImhNone
                                        accessibleName: field.modelData.key
                                        onActiveFocusChanged: { if (activeFocus) sheet.reveal(input) }
                                        onValuePreviewed: value => sheet.controller.draft(field.modelData.key, value)
                                        Connections {
                                            target: sheet.controller
                                            function onDraftsCleared() { input.text = field.secret ? "" : String(field.modelData.value || "") }
                                        }
                                    }
                                    Ui.Select {
                                        id: choice
                                        objectName: "providerChoice_" + field.modelData.key
                                        Layout.fillWidth: true
                                        visible: !!field.modelData.options && field.modelData.options.length > 0
                                        enabled: !sheet.controller.busy
                                        options: (field.modelData.options || []).map(value => ({label: value, value: value}))
                                        value: String(field.modelData.value || "")
                                        displayText: currentIndex < 0 ? "Not set" : currentText
                                        accessibleName: field.modelData.key
                                        onActiveFocusChanged: { if (activeFocus) sheet.reveal(choice) }
                                        onValueCommitted: value => sheet.controller.draft(field.modelData.key, value)
                                    }
                                    Ui.EditorButton {
                                        id: testButton
                                        objectName: "testProvider_" + field.modelData.key
                                        visible: field.secret
                                        text: "Test"
                                        accessibleName: "Test " + field.modelData.key
                                        enabled: !sheet.controller.busy
                                        onActiveFocusChanged: { if (activeFocus) sheet.reveal(testButton) }
                                        onClicked: sheet.controller.test(field.modelData.key)
                                    }
                                    Ui.EditorButton {
                                        id: removeButton
                                        objectName: "removeProvider_" + field.modelData.key
                                        visible: field.secret && !!field.modelData.removable
                                        variant: Ui.EditorButton.Flat
                                        iconName: "deleteOutline"
                                        text: ""
                                        accessibleName: "Remove stored " + field.modelData.key
                                        enabled: !sheet.controller.busy && !sheet.controller.dirty
                                        onActiveFocusChanged: { if (activeFocus) sheet.reveal(removeButton) }
                                        onClicked: { sheet.pendingRemoval = field.modelData.key; removeDialog.open() }
                                    }
                                }
                                Ui.Text {
                                    width: parent.width
                                    visible: text.length > 0
                                    text: field.envOnly ? "Set by the server environment. A new key here overrides it for this account." : (field.modelData.description || "")
                                    wrapMode: Text.WordWrap
                                    role: Ui.Typography.SansCaption
                                    tone: Ui.Text.Secondary
                                }
                            }
                        }
                        Ui.EmptyState {
                            width: parent.width
                            visible: sheet.controller.fields.length === 0 && !sheet.controller.busy && sheet.controller.selectedGroup.length > 0
                            title: "Nothing to configure"
                            message: "This server has no editable settings for this provider."
                        }
                        Ui.Status {
                            objectName: "providerTestMessage"
                            width: parent.width
                            visible: message.length > 0
                            status: Ui.Status.Info
                            message: sheet.controller.testMessage
                            Accessible.role: Accessible.AlertMessage
                        }
                        Ui.EditorButton {
                            id: modelsButton
                            objectName: "checkProviderModels"
                            visible: sheet.controller.selectedGroup.length > 0
                            text: "Check available models"
                            iconName: "refresh"
                            enabled: !sheet.controller.busy && !sheet.controller.dirty && sheet.controller.selectedGroup.length > 0
                            onActiveFocusChanged: { if (activeFocus) sheet.reveal(modelsButton) }
                            onClicked: sheet.controller.checkModels()
                        }
                    }
                }
            }
        }
        Ui.Separator { Layout.fillWidth: true }
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Ui.Text {
                Layout.fillWidth: true
                text: sheet.controller.dirty ? "Unsaved changes" : "Keys are stored on the connected server."
                elide: Text.ElideRight
                role: Ui.Typography.SansCaption
                tone: sheet.controller.dirty ? Ui.Text.Warning : Ui.Text.Secondary
            }
            Ui.EditorButton {
                objectName: "cancelProviderSettings"
                text: "Close"
                enabled: !sheet.controller.busy
                onClicked: sheet.requestClose()
            }
            Ui.EditorButton {
                objectName: "saveProviderSettings"
                variant: Ui.EditorButton.Primary
                text: "Save"
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
