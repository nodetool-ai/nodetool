pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import QtQuick.Dialogs
import NodeTool.ModelPicker

// Follows web MediaChatComposer.tsx: attach, mode, model, reasoning and media
// setting chips, the @ asset picker and Send or Generate.
Ui.Surface {
    id: root
    required property var session
    property string previousThread: ""
    readonly property bool running: session && ["loading", "running", "streaming", "sending", "stopping"].indexOf(session.turnStatus) >= 0
    readonly property bool mediaMode: !!session && !!session.mediaMode && session.mediaMode !== "chat"
    readonly property var activeMode: {
        const modes = root.session && root.session.mediaModes ? root.session.mediaModes : []
        for (let i = 0; i < modes.length; ++i) {
            if (modes[i].id === (root.session ? root.session.mediaMode : "chat")) {
                return modes[i]
            }
        }
        return {id: "chat", chipLabel: qsTr("Chat"), iconName: "forumOutlined"}
    }
    readonly property bool hasAttachments: !!session && !!session.attachments && session.attachments.length > 0
    // The @ mention being typed, as {start, end, query}, or null.
    property var mention: null
    property int dismissedMention: -1
    property string mentionTab: "recent"
    property int mentionIndex: 0
    readonly property var mentionAssets: !mention || !session ? [] : (mentionTab === "recent" ? session.recentAssets : session.assetResults) || []
    // MediaChatComposer.tsx isCompact: icon-first chips below the narrow card width.
    readonly property bool compact: width > 0 && width < ChatMetrics.narrowComposer
    // usePromptHistory.ts: sent prompts for this composer, the entry being
    // shown (-1 for the live draft) and the draft kept while navigating.
    property var promptHistory: []
    property int historyIndex: -1
    property string historyStash: ""
    readonly property var activePermission: {
        const modes = root.session && root.session.permissionModes ? root.session.permissionModes : []
        for (let i = 0; i < modes.length; ++i) {
            if (modes[i].value === root.session.permissionMode) {
                return modes[i]
            }
        }
        return {value: "default", label: qsTr("Default"), description: ""}
    }
    variant: Ui.Surface.Panel
    implicitHeight: composerContent.implicitHeight + Ui.Metrics.md * 2
    objectName: "chatComposer"
    // The host app's provider settings dialog. The standalone chat app has none and opens the web settings.
    function nativeProviderSettings() {
        const pending = root.Window.window ? [root.Window.window.contentItem] : []
        while (pending.length > 0) {
            const item = pending.shift()
            if (item.objectName === "providerSettingsDialog") {
                return item
            }
            const data = item.data || []
            for (let i = 0; i < data.length; ++i) {
                pending.push(data[i])
            }
        }
        return null
    }
    function focusEditor() {
        editor.forceActiveFocus()
    }
    // useTextareaAssetMention.tsx syncFromTextarea.
    function syncMention() {
        if (!root.session || !root.session.mentionTrigger) {
            return
        }
        const trigger = root.session.mentionTrigger(editor.text, editor.cursorPosition)
        if (trigger.start === undefined) {
            root.dismissedMention = -1
            root.closeMention()
            return
        }
        if (trigger.start === root.dismissedMention) {
            return
        }
        root.dismissedMention = -1
        if (!root.mention || root.mention.start !== trigger.start) {
            root.mentionIndex = 0
            root.mentionTab = root.session.recentAssets.length > 0 ? "recent" : "saved"
        }
        root.mention = trigger
        root.session.searchAssets(trigger.query)
    }
    function closeMention() {
        if (root.mention === null) {
            return
        }
        root.mention = null
        root.mentionIndex = 0
        root.session.closeAssetSearch()
    }
    // A picked asset is attached, not written into the prompt.
    function selectMention(index) {
        const asset = root.mentionAssets[index]
        if (!asset || !root.mention) {
            return
        }
        const result = root.session.removeMention(editor.text, root.mention.start, root.mention.end)
        root.session.attachAsset(asset)
        editor.text = result.text
        root.session.draft = result.text
        editor.cursorPosition = result.caret
        root.closeMention()
        editor.forceActiveFocus()
    }
    function submit() {
        if (!root.session || root.running) {
            return
        }
        if (editor.text.trim().length === 0 && !root.hasAttachments) {
            return
        }
        root.recordPrompt(editor.text)
        root.session.send()
    }
    // usePromptHistory.ts record: skips blanks and consecutive duplicates.
    function recordPrompt(prompt) {
        root.historyIndex = -1
        root.historyStash = ""
        if (prompt.trim().length === 0 || root.promptHistory[root.promptHistory.length - 1] === prompt) {
            return
        }
        const history = root.promptHistory.slice()
        history.push(prompt)
        while (history.length > ChatMetrics.promptHistory) {
            history.shift()
        }
        root.promptHistory = history
    }
    function showHistory(prompt) {
        editor.text = prompt
        root.session.draft = prompt
        editor.cursorPosition = prompt.length
    }
    // usePromptHistory.ts handleKeyDown: Up from the start of the field steps
    // back, Down from its end steps forward and past the newest entry restores
    // the draft. Returns true when it took the key.
    function navigateHistory(up) {
        const history = root.promptHistory
        if (history.length === 0) {
            return false
        }
        if (up) {
            if (root.historyIndex === -1) {
                if (editor.selectionStart !== 0 || editor.selectionEnd !== 0) {
                    return false
                }
                root.historyStash = editor.text
                root.historyIndex = history.length - 1
                root.showHistory(history[root.historyIndex])
                return true
            }
            if (root.historyIndex > 0) {
                root.historyIndex -= 1
                root.showHistory(history[root.historyIndex])
            }
            return true
        }
        if (root.historyIndex === -1 || editor.selectionStart !== editor.text.length || editor.selectionEnd !== editor.text.length) {
            return false
        }
        if (root.historyIndex < history.length - 1) {
            root.historyIndex += 1
            root.showHistory(history[root.historyIndex])
            return true
        }
        root.historyIndex = -1
        root.showHistory(root.historyStash)
        return true
    }
    ColumnLayout {
        id: composerContent
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.md
        Ui.Surface {
            id: mentionMenu
            objectName: "assetMentionMenu"
            variant: Ui.Surface.Overlay
            visible: root.mention !== null
            radius: Ui.Metrics.radiusOverlay
            Layout.fillWidth: true
            Layout.preferredHeight: Math.min(ChatMetrics.mentionMenu, mentionContent.implicitHeight + Ui.Metrics.xs * 2)
            ColumnLayout {
                id: mentionContent
                anchors.fill: parent
                anchors.margins: Ui.Metrics.xs
                spacing: Ui.Metrics.xs
                RowLayout {
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.xs
                    Ui.EditorButton {
                        objectName: "assetMentionRecent"
                        focusPolicy: Qt.NoFocus
                        text: qsTr("Recent")
                        variant: Ui.EditorButton.Flat
                        active: root.mentionTab === "recent"
                        onClicked: {
                            root.mentionTab = "recent"
                            root.mentionIndex = 0
                            editor.forceActiveFocus()
                        }
                    }
                    Ui.EditorButton {
                        objectName: "assetMentionSaved"
                        focusPolicy: Qt.NoFocus
                        text: qsTr("Saved")
                        variant: Ui.EditorButton.Flat
                        active: root.mentionTab === "saved"
                        onClicked: {
                            root.mentionTab = "saved"
                            root.mentionIndex = 0
                            editor.forceActiveFocus()
                        }
                    }
                    Item {
                        Layout.fillWidth: true
                    }
                }
                ListView {
                    id: mentionList
                    objectName: "assetMentionList"
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.preferredHeight: contentHeight
                    clip: true
                    model: root.mentionAssets
                    currentIndex: root.mentionIndex
                    ScrollBar.vertical: Ui.ScrollBar {}
                    onAtYEndChanged: if (atYEnd && root.mentionTab === "saved") root.session.loadMoreAssets()
                    delegate: Ui.ListRow {
                        id: assetRow
                        required property var modelData
                        required property int index
                        objectName: "assetMention-" + modelData.id
                        focusPolicy: Qt.NoFocus
                        width: ListView.view.width
                        active: index === root.mentionIndex
                        accessibleName: (modelData.name || modelData.id) + ", " + (modelData.content_type || "")
                        onClicked: root.selectMention(index)
                        onHoveredChanged: if (hovered) root.mentionIndex = index
                        RowLayout {
                            width: assetRow.availableWidth
                            spacing: Ui.Metrics.sm
                            Ui.Text {
                                Layout.fillWidth: true
                                role: Ui.Typography.SansLabel
                                text: assetRow.modelData.name || assetRow.modelData.id
                                elide: Text.ElideMiddle
                            }
                            Ui.Text {
                                role: Ui.Typography.SansCaption
                                tone: Ui.Text.Secondary
                                text: assetRow.modelData.content_type || ""
                            }
                        }
                    }
                }
                Ui.Text {
                    objectName: "assetMentionEmpty"
                    Layout.fillWidth: true
                    Layout.margins: Ui.Metrics.sm
                    visible: root.mentionAssets.length === 0
                    role: Ui.Typography.SansLabel
                    tone: Ui.Text.Secondary
                    text: root.mentionTab === "recent" ? qsTr("No recent assets") : qsTr("No matching assets")
                }
            }
        }
        ScrollView {
            Layout.fillWidth: true
            Layout.preferredHeight: Math.min(Ui.Metrics.comfortable * 5, Math.max(Ui.Metrics.comfortable * 2, editor.implicitHeight))
            // The draft and its placeholder wrap at the composer width instead of scrolling sideways.
            contentWidth: availableWidth
            Ui.TextArea {
                id: editor
                objectName: "chatInput"
                value: root.session ? root.session.draft : ""
                // MediaChatComposer.tsx placeholder for each mode, from en.json.
                placeholderText: {
                    const mode = root.session ? root.session.mediaMode : "chat"
                    const placeholders = {
                        image: qsTr("Describe the image you want to generate…"),
                        image_edit: qsTr("Describe the edits to apply to the dropped image…"),
                        video: qsTr("Describe your video… like a man drinking a cup of coffee…"),
                        image_to_video: qsTr("Describe how the dropped image should animate…"),
                        reference_to_video: qsTr("Describe the shot — the attached images and videos are the references…"),
                        retake: qsTr("Describe what to change in the attached video…"),
                        extend: qsTr("Describe what happens in the added footage…"),
                        audio: qsTr("Type the text you want spoken…"),
                        music: qsTr("Describe the music you want to generate…")
                    }
                    return placeholders[mode] || qsTr("Ask anything, or type @ to add an asset…")
                }
                wrapMode: TextEdit.Wrap
                selectByMouse: true
                accessibleName: qsTr("Message prompt")
                onValuePreviewed: value => {
                    if (root.session && root.session.draft !== value) {
                        root.session.draft = value
                    }
                }
                onTextChanged: root.syncMention()
                onCursorPositionChanged: root.syncMention()
                // MediaChatComposer.tsx handleKeyDown: an IME composition keeps its
                // keys, the mention picker takes navigation keys next, then Escape
                // stops a reply in flight, then prompt history, then Enter sends
                // and Shift+Enter inserts a line.
                Keys.onPressed: event => {
                    if (inputMethodComposing) {
                        return
                    }
                    if (root.mention !== null && !inputMethodComposing) {
                        if (event.key === Qt.Key_Escape) {
                            root.dismissedMention = root.mention.start
                            root.closeMention()
                            event.accepted = true
                            return
                        }
                        const count = root.mentionAssets.length
                        if (count > 0 && event.key === Qt.Key_Down) {
                            root.mentionIndex = (root.mentionIndex + 1) % count
                            event.accepted = true
                            return
                        }
                        if (count > 0 && event.key === Qt.Key_Up) {
                            root.mentionIndex = (root.mentionIndex - 1 + count) % count
                            event.accepted = true
                            return
                        }
                        if (count > 0 && (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Tab)) {
                            root.selectMention(Math.min(root.mentionIndex, count - 1))
                            event.accepted = true
                            return
                        }
                    }
                    if (event.key === Qt.Key_Escape && root.running && root.session.turnStatus !== "stopping") {
                        root.session.stop()
                        event.accepted = true
                        return
                    }
                    const plain = (event.modifiers & (Qt.ShiftModifier | Qt.ControlModifier | Qt.AltModifier | Qt.MetaModifier)) === 0
                    if (plain && (event.key === Qt.Key_Up || event.key === Qt.Key_Down) && root.navigateHistory(event.key === Qt.Key_Up)) {
                        event.accepted = true
                        return
                    }
                    // The web sends on Enter and Ctrl+Enter and leaves Shift, Alt and
                    // Cmd (Meta on the web) to the text field.
                    if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && !(event.modifiers & (Qt.ShiftModifier | Qt.AltModifier))) {
                        root.submit()
                        event.accepted = true
                    }
                }
            }
        }
        Repeater {
            model: root.session ? root.session.attachments : []
            delegate: RowLayout {
                id: attachmentRow
                required property var modelData
                Layout.fillWidth: true
                Ui.Text {
                    role: Ui.Typography.SansLabel
                    Layout.fillWidth: true
                    text: attachmentRow.modelData.name + " · " + attachmentRow.modelData.status
                    tone: Ui.Text.Secondary
                    elide: Text.ElideMiddle
                }
                Ui.Progress {
                    accessibleName: qsTr("Attachment upload progress")
                    from: 0
                    to: 100
                    visible: attachmentRow.modelData.status === "uploading"
                    value: attachmentRow.modelData.progress || 0
                }
                Ui.EditorButton {
                    text: attachmentRow.modelData.status === "uploading" ? qsTr("Cancel upload") : qsTr("Remove")
                    onClicked: root.session.removeAttachment(attachmentRow.modelData.id)
                }
            }
        }
        Flow {
            id: chipRow
            objectName: "composerChips"
            Layout.fillWidth: true
            spacing: Ui.Metrics.xs
            Ui.ToolbarIconButton {
                text: qsTr("Add to message")
                iconName: "add"
                variant: Ui.EditorButton.Flat
                enabled: !!root.session && !root.running
                onClicked: fileDialog.open()
            }
            Ui.MenuButton {
                id: modeChip
                objectName: "mediaModeChip"
                text: root.activeMode.chipLabel
                iconName: root.activeMode.iconName
                accessibleName: qsTr("Generation mode: ") + root.activeMode.chipLabel
                description: root.compact ? root.activeMode.chipLabel : ""
                display: root.compact ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon
                circular: true
                variant: Ui.EditorButton.Flat
                menu: modeMenu
                Ui.ContextMenu {
                    id: modeMenu
                    Instantiator {
                        model: root.session && root.session.mediaModes ? root.session.mediaModes : []
                        delegate: Ui.MenuItem {
                            required property var modelData
                            objectName: "mediaMode-" + modelData.id
                            text: modelData.label
                            iconName: modelData.iconName
                            accessibleName: modelData.label + (modelData.description ? ", " + modelData.description : "")
                            reasonText: modelData.description
                            checkable: true
                            checked: !!root.session && root.session.mediaMode === modelData.id
                            enabled: modelData.enabled
                            onTriggered: root.session.mediaMode = modelData.id
                        }
                        onObjectAdded: (index, object) => modeMenu.insertItem(index, object)
                        onObjectRemoved: (index, object) => modeMenu.removeItem(object)
                    }
                }
            }
            Ui.EditorButton {
                id: modelChooser
                objectName: "chooseChatModel"
                visible: !root.mediaMode
                width: Math.min(implicitWidth, Math.max(Ui.Metrics.comfortable, root.width - Ui.Metrics.comfortable * 3))
                variant: Ui.EditorButton.Flat
                circular: true
                text: root.session && root.session.model
                      ? root.session.model + (root.session.modelCatalog.loaded && !root.session.modelCatalog.selectionAvailable ? qsTr(" (Unavailable)") : "")
                      : qsTr("Default model")
                accessibleName: qsTr("Choose provider and model")
                trailingIconName: "arrowDropDown"
                menuButton: true
                menuExpanded: modelPickerLoader.item ? modelPickerLoader.item.visible : false
                enabled: !!modelPickerLoader.item
                onClicked: modelPickerLoader.item.openAt(modelChooser)
            }
            // ReasoningSelector.tsx renders only for a model that takes a reasoning level.
            Ui.MenuButton {
                id: reasoningChip
                objectName: "reasoningChip"
                visible: !root.mediaMode && !!root.session && !!root.session.reasoningSupported
                readonly property var level: {
                    const levels = root.session && root.session.reasoningLevels ? root.session.reasoningLevels : []
                    for (let i = 0; i < levels.length; ++i) {
                        if (levels[i].value === (root.session ? root.session.reasoningEffort : "")) {
                            return levels[i]
                        }
                    }
                    return {value: "", label: qsTr("Default")}
                }
                text: level.label
                iconName: "memory"
                description: qsTr("Reasoning: ") + level.label
                accessibleName: qsTr("Reasoning level: ") + level.label
                display: root.compact ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon
                circular: true
                variant: Ui.EditorButton.Flat
                menu: reasoningMenu
                Ui.ContextMenu {
                    id: reasoningMenu
                    Instantiator {
                        model: root.session && root.session.reasoningLevels ? root.session.reasoningLevels : []
                        delegate: Ui.MenuItem {
                            required property var modelData
                            objectName: "reasoning-" + (modelData.value || "default")
                            text: modelData.label
                            accessibleName: modelData.label + ", " + modelData.description
                            checkable: true
                            checked: !!root.session && root.session.reasoningEffort === modelData.value
                            onTriggered: root.session.reasoningEffort = modelData.value
                        }
                        onObjectAdded: (index, object) => reasoningMenu.insertItem(index, object)
                        onObjectRemoved: (index, object) => reasoningMenu.removeItem(object)
                    }
                }
            }
            // PermissionSelector.tsx: the thread's permission mode, dot only when narrow.
            Ui.MenuButton {
                id: permissionChip
                objectName: "permissionChip"
                visible: !root.mediaMode && !!root.session && !!root.session.permissionModes
                text: root.activePermission.label
                iconName: "statusDot"
                description: qsTr("Permission: ") + root.activePermission.label + " — " + root.activePermission.description
                accessibleName: qsTr("Permission mode: ") + root.activePermission.label
                display: root.compact ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon
                circular: true
                variant: Ui.EditorButton.Flat
                menu: permissionMenu
                Ui.ContextMenu {
                    id: permissionMenu
                    Instantiator {
                        model: root.session && root.session.permissionModes ? root.session.permissionModes : []
                        delegate: Ui.MenuItem {
                            required property var modelData
                            objectName: "permission-" + modelData.value
                            text: modelData.label
                            iconName: "statusDot"
                            accessibleName: modelData.label + ", " + modelData.description
                            checkable: true
                            checked: !!root.session && root.session.permissionMode === modelData.value
                            onTriggered: root.session.permissionMode = modelData.value
                        }
                        onObjectAdded: (index, object) => permissionMenu.insertItem(index, object)
                        onObjectRemoved: (index, object) => permissionMenu.removeItem(object)
                    }
                }
            }
            Ui.EditorButton {
                id: mediaModelChooser
                objectName: "chooseMediaModel"
                visible: root.mediaMode
                width: Math.min(implicitWidth, Math.max(Ui.Metrics.comfortable, root.width - Ui.Metrics.comfortable * 3))
                variant: Ui.EditorButton.Flat
                circular: true
                iconName: root.activeMode.iconName
                text: root.session && root.session.mediaModelName ? root.session.mediaModelName : root.session && root.session.mediaModelPlaceholder ? root.session.mediaModelPlaceholder : ""
                accessibleName: qsTr("Choose generation model")
                trailingIconName: "arrowDropDown"
                menuButton: true
                menuExpanded: mediaPickerLoader.item ? mediaPickerLoader.item.visible : false
                enabled: !!mediaPickerLoader.item
                onClicked: mediaPickerLoader.item.openAt(mediaModelChooser)
            }
            Repeater {
                model: root.mediaMode && root.session && root.session.mediaChips ? root.session.mediaChips : []
                delegate: Ui.ChipMenu {
                    id: settingChip
                    required property var modelData
                    objectName: "mediaSetting-" + modelData.key
                    options: modelData.options
                    value: modelData.value
                    text: modelData.label
                    iconName: modelData.iconName
                    description: modelData.header
                    accessibleName: modelData.header + ": " + modelData.label
                    onValueCommitted: value => root.session.setMediaSetting(settingChip.modelData.key, value)
                }
            }
        }
        RowLayout {
            Layout.fillWidth: true
            Ui.Text {
                objectName: "composerModelBanner"
                Layout.fillWidth: true
                visible: text.length > 0
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                wrapMode: Text.WordWrap
                text: root.mediaMode && root.session && !root.session.mediaModelName ? root.session.mediaModelHint : ""
            }
            Item {
                Layout.fillWidth: true
            }
            Ui.ToolbarIconButton {
                objectName: "sendMessage"
                visible: root.running || !root.mediaMode
                text: root.running ? qsTr("Stop") : qsTr("Send")
                iconName: root.running ? "stop" : "send"
                variant: Ui.EditorButton.Primary
                Layout.preferredWidth: Ui.Metrics.xxxl
                implicitHeight: Ui.Metrics.xxxl
                enabled: !!root.session && root.session.turnStatus !== "stopping" && (root.running || editor.text.trim().length > 0 || root.hasAttachments)
                onClicked: {
                    if (root.running) {
                        root.session.stop()
                    } else {
                        root.submit()
                    }
                }
            }
            Ui.EditorButton {
                objectName: "generateMedia"
                visible: !root.running && root.mediaMode
                text: qsTr("Generate")
                variant: Ui.EditorButton.Primary
                circular: true
                enabled: !!root.session && (editor.text.trim().length > 0 || root.hasAttachments)
                onClicked: root.submit()
            }
        }
    }
    Component.onCompleted: previousThread = session ? session.selectedThreadId : ""
    Connections {
        target: root.session
        ignoreUnknownSignals: true
        function onStateChanged() {
            if (root.session.selectedThreadId !== root.previousThread) {
                root.previousThread = root.session.selectedThreadId
                editor.cancelEdit()
            } else if (root.session.selectedThreadId !== "" && root.session.draft === "" && editor.text !== "" && !editor.inputMethodComposing) {
                // A sent draft clears the prompt.
                editor.cancelEdit()
                editor.text = ""
            }
        }
        function onModelPickerRequested() {
            if (root.mediaMode && mediaPickerLoader.item) {
                mediaPickerLoader.item.openAt(mediaModelChooser)
            }
        }
    }
    Loader {
        id: modelPickerLoader
        active: !!root.session && !!root.session.modelCatalog
        sourceComponent: ModelPicker {
            catalog: root.session.modelCatalog
            allowServerDefault: true
            onUseServerDefaultRequested: {
                root.session.useServerDefaultModel()
                close()
            }
            onAddProvidersRequested: {
                const dialog = root.nativeProviderSettings()
                close()
                if (dialog) {
                    dialog.open()
                } else {
                    root.session.openProviderSettings()
                }
            }
        }
    }
    Loader {
        id: mediaPickerLoader
        active: !!root.session && !!root.session.mediaCatalog
        sourceComponent: ModelPicker {
            catalog: root.session.mediaCatalog
            onAddProvidersRequested: {
                const dialog = root.nativeProviderSettings()
                close()
                if (dialog) {
                    dialog.open()
                } else {
                    root.session.openProviderSettings()
                }
            }
        }
    }
    FileDialog {
        id: fileDialog
        title: qsTr("Attach a file")
        onAccepted: root.session.addAttachment(selectedFile)
    }
}
