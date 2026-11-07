import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import NodeTool.ModelPicker
import "../assets/AssetContext.js" as Context

// Draws a reference image for an entity with an image model. One take is the answer.
// Several takes are a choice the person makes here.
Ui.Dialog {
    id: dialog
    objectName: "entityReferenceDialog"
    property var assist: null
    property var library: null
    property string kind: "character"
    property string entityName: ""
    property string currentAssetId: ""
    property string viewId: ""
    property bool keepLook: false
    property int takeCount: 1
    property string chosenTake: ""
    readonly property alias catalog: imageCatalog
    readonly property alias promptField: prompt
    readonly property var views: assist ? assist.referenceViews(kind) : []
    readonly property var view: {
        for (const row of views) if (row.id === viewId) return row
        return views.length > 0 ? views[0] : {id: "", label: "", aspectRatio: "1:1"}
    }
    readonly property bool editing: keepLook && currentAssetId !== ""
    readonly property bool generating: !!assist && assist.generating
    readonly property bool choosing: !!assist && assist.takes.length > 0
    readonly property var tasks: imageCatalog.selectedModel.supported_tasks || []
    readonly property bool modelCapable: !editing || tasks.indexOf("image_to_image") >= 0
    readonly property bool modelPicked: imageCatalog.selectedModelId !== "" && imageCatalog.selectedProvider !== ""
    // Why Generate is off, or an empty string when it is on.
    readonly property string blocker: {
        if (prompt.text.trim() === "") return "Write a prompt to generate."
        if (!modelPicked) return "Pick an image model to generate the reference."
        if (!modelCapable) return "This model cannot edit a picture. Pick another model, or turn off Keep the current look."
        return ""
    }
    readonly property string imageUrl: library && currentAssetId !== "" && library.imageUrls[currentAssetId] ? library.imageUrls[currentAssetId] : ""
    readonly property real aspect: {
        const parts = String(view.aspectRatio).split(":")
        return Number(parts[0]) / Number(parts[1]) || 1
    }
    signal picked(string id)
    function openFor(entityKind, name, descriptor, current) {
        kind = entityKind
        entityName = name
        currentAssetId = current
        descriptorText = descriptor
        viewId = views.length > 0 ? views[0].id : ""
        keepLook = current !== ""
        takeCount = 1
        chosenTake = ""
        assist.cancelReference()
        setPrompt()
        if (library && current !== "") library.resolveImages([current])
        open()
    }
    property string descriptorText: ""
    function setPrompt() {
        const text = assist.referencePrompt(kind, entityName, descriptorText, viewId)
        prompt.cancelEdit()
        prompt.value = text
        prompt.text = text
    }
    function generate() {
        if (blocker !== "" || generating) return
        assist.generateReference({provider: imageCatalog.selectedProvider, model: imageCatalog.selectedModelId,
            prompt: prompt.text, aspectRatio: view.aspectRatio, takes: takeCount, sourceAssetId: editing ? currentAssetId : ""})
    }
    function useTake(id) {
        if (id !== "") assist.chooseTake(id)
    }
    function takeTime() { return Date.now() }
    title: "New picture of " + (entityName !== "" ? entityName : "this " + kind)
    width: Math.min(Ui.Metrics.dialogWidth, parent ? parent.width - Ui.Metrics.xl * 2 : Ui.Metrics.dialogWidth)
    height: Math.min(implicitHeight, parent ? parent.height - Ui.Metrics.xl * 2 : implicitHeight)
    // The dialog adds its padding under the header. Cancel it so the form sits Metrics.md below the title.
    spacing: Ui.Metrics.micro - topPadding
    // Closing abandons the request, so a late answer cannot replace a picture chosen since.
    onClosed: if (assist) assist.cancelReference()
    onKeepLookChanged: imageCatalog.mode = keepLook && currentAssetId !== "" ? "image_model" : "image"

    ModelCatalogController { id: imageCatalog; objectName: "entityReferenceCatalog"; mode: "image" }
    Connections {
        target: dialog.assist
        function onReferenceReady(id) {
            if (!dialog.visible) return
            dialog.picked(id)
            dialog.close()
        }
        function onChanged() {
            if (!dialog.visible) return
            const takes = dialog.assist.takes
            if (takes.length > 0) {
                if (dialog.library) dialog.library.resolveImages(takes)
                if (takes.indexOf(dialog.chosenTake) < 0) dialog.chosenTake = takes[0]
            }
        }
    }

    component FieldLabel: Ui.Text {
        Layout.fillWidth: true
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Secondary
        wrapMode: Text.Wrap
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.Metrics.md
        Ui.Banner {
            objectName: "entityReferenceError"
            visible: !!dialog.assist && !dialog.generating && !dialog.choosing && dialog.assist.generateError !== ""
            Layout.fillWidth: true
            status: Ui.Status.Error
            message: dialog.assist ? dialog.assist.generateError : ""
        }
        Flickable {
            id: scroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            implicitHeight: body.implicitHeight
            clip: true
            contentWidth: width
            contentHeight: body.implicitHeight
            boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: Ui.ScrollBar {}
            // Scrolls a field into view when keyboard focus reaches it.
            function reveal(item) {
                let inside = false
                for (let ancestor = item; ancestor; ancestor = ancestor.parent) {
                    if (ancestor === body) { inside = true; break }
                }
                if (!inside) return
                const top = item.mapToItem(body, 0, 0).y - Ui.Metrics.xxl
                const bottom = item.mapToItem(body, 0, item.height).y + Ui.Metrics.md
                if (top < contentY) contentY = Math.max(0, top)
                else if (bottom > contentY + height) contentY = Math.min(contentHeight - height, bottom - height)
            }
            Connections {
                target: body.Window.window
                function onActiveFocusItemChanged() { scroll.reveal(body.Window.window.activeFocusItem) }
            }
            onHeightChanged: if (dialog.visible && body.Window.window) reveal(body.Window.window.activeFocusItem)
            ColumnLayout {
                id: body
                // The scrollbar overlays the right edge. A gutter that came and went would rewrap the takes and loop.
                width: scroll.width
                spacing: Ui.Metrics.lg
                ColumnLayout {
                    objectName: "entityReferenceForm"
                    visible: !dialog.choosing
                    enabled: !dialog.generating
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.lg
                    Ui.Text {
                        Layout.fillWidth: true
                        text: "Choose a view, then edit the prompt to refine the image."
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        wrapMode: Text.Wrap
                    }
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.xs
                        FieldLabel { text: "View" }
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.xs
                            Repeater {
                                model: dialog.views
                                Ui.EditorButton {
                                    required property var modelData
                                    objectName: "entityView_" + modelData.id
                                    density: Ui.EditorButton.Compact
                                    // Accent marks the chosen view, so a hover is never mistaken for it.
                                    variant: checked ? Ui.EditorButton.Primary : Ui.EditorButton.Default
                                    text: modelData.label
                                    checkable: true
                                    autoExclusive: true
                                    checked: dialog.view.id === modelData.id
                                    onClicked: { dialog.viewId = modelData.id; dialog.setPrompt() }
                                }
                            }
                            Item { Layout.fillWidth: true }
                        }
                    }
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.xs
                        FieldLabel { text: "Prompt" }
                        Ui.TextArea {
                            id: prompt
                            objectName: "entityReferencePrompt"
                            Layout.fillWidth: true
                            Layout.minimumHeight: Ui.Metrics.touch * 2
                            accessibleName: "Prompt"
                            selectByMouse: true
                        }
                    }
                    RowLayout {
                        objectName: "entityReferenceKeepLook"
                        visible: dialog.currentAssetId !== ""
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.md
                        Rectangle {
                            Layout.alignment: Qt.AlignTop
                            Layout.preferredWidth: Ui.Metrics.touch + Ui.Metrics.xs
                            Layout.preferredHeight: Ui.Metrics.touch + Ui.Metrics.xs
                            color: Ui.Theme.surfaceInput
                            radius: Ui.Metrics.radiusControl
                            Image {
                                id: current
                                anchors.fill: parent
                                anchors.margins: Ui.Metrics.micro
                                source: dialog.imageUrl
                                asynchronous: true
                                fillMode: Image.PreserveAspectCrop
                                sourceSize: Qt.size(width * 2, height * 2)
                                visible: status === Image.Ready
                            }
                            Rectangle {
                                anchors.fill: parent
                                radius: parent.radius
                                color: "transparent"
                                border.width: Ui.Metrics.border
                                border.color: Ui.Theme.borderSubtle
                            }
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.xs
                            Ui.Toggle {
                                id: keep
                                objectName: "entityKeepLook"
                                text: "Keep the current look"
                                checked: dialog.keepLook
                                onCheckedChangedByUser: checked => dialog.keepLook = checked
                            }
                            Ui.Text {
                                Layout.fillWidth: true
                                text: "Edit the current picture instead of drawing from the prompt alone, so the same person or place stays recognizable."
                                role: Ui.Typography.SansCaption
                                tone: Ui.Text.Secondary
                                wrapMode: Text.Wrap
                            }
                        }
                    }
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.lg
                        ColumnLayout {
                            Layout.fillWidth: true
                            Layout.alignment: Qt.AlignTop
                            spacing: Ui.Metrics.xs
                            FieldLabel { text: "Image model" }
                            ModelPickerButton {
                                id: modelPicker
                                objectName: "entityReferenceModel"
                                Layout.fillWidth: true
                                catalog: imageCatalog
                                placeholder: "Pick an image model"
                                Accessible.name: "Image model"
                                onAddProvidersRequested: {
                                    const window = dialog.parent ? dialog.parent.Window.window : null
                                    const settings = Context.itemNamed(window ? window.contentItem : null, "providerSettingsDialog")
                                    if (settings) settings.open()
                                }
                            }
                            Ui.Text {
                                objectName: "entityReferenceModelHelp"
                                Layout.fillWidth: true
                                text: dialog.modelPicked ? "Used to create the reference image." : "Pick an image model to generate the reference."
                                role: Ui.Typography.SansCaption
                                tone: Ui.Text.Secondary
                                wrapMode: Text.Wrap
                            }
                            Ui.Text {
                                visible: imageCatalog.error !== ""
                                Layout.fillWidth: true
                                text: imageCatalog.error
                                role: Ui.Typography.SansCaption
                                tone: Ui.Text.Error
                                wrapMode: Text.Wrap
                            }
                        }
                        ColumnLayout {
                            Layout.alignment: Qt.AlignTop
                            spacing: Ui.Metrics.xs
                            FieldLabel { text: "Takes" }
                            RowLayout {
                                spacing: Ui.Metrics.xs
                                Repeater {
                                    model: [1, 2, 4]
                                    Ui.EditorButton {
                                        required property int modelData
                                        objectName: "entityTakes_" + modelData
                                        density: Ui.EditorButton.Compact
                                        variant: checked ? Ui.EditorButton.Primary : Ui.EditorButton.Default
                                        text: String(modelData)
                                        accessibleName: modelData + (modelData === 1 ? " take" : " takes")
                                        checkable: true
                                        autoExclusive: true
                                        checked: dialog.takeCount === modelData
                                        onClicked: dialog.takeCount = modelData
                                    }
                                }
                            }
                        }
                    }
                }
                ColumnLayout {
                    objectName: "entityReferenceTakes"
                    visible: dialog.choosing
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.md
                    Ui.Text {
                        Layout.fillWidth: true
                        text: "Pick the take to use. Double-click a take to use it right away."
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        wrapMode: Text.Wrap
                    }
                    GridLayout {
                        id: takeGrid
                        Layout.fillWidth: true
                        readonly property real gap: Ui.Metrics.md
                        columns: Math.max(1, Math.floor((width + gap) / (160 * Ui.Theme.uiScale + gap)))
                        columnSpacing: gap
                        rowSpacing: gap
                        Repeater {
                            model: dialog.assist ? dialog.assist.takes : []
                            Item {
                                id: take
                                required property string modelData
                                required property int index
                                readonly property bool chosen: dialog.chosenTake === modelData
                                property real lastRelease: 0
                                objectName: "entityTake_" + modelData
                                Layout.fillWidth: true
                                Layout.preferredHeight: width / dialog.aspect
                                activeFocusOnTab: true
                                Accessible.role: Accessible.Button
                                Accessible.name: "Take " + (index + 1)
                                Accessible.checked: chosen
                                Accessible.onPressAction: dialog.chosenTake = modelData
                                Keys.onSpacePressed: dialog.chosenTake = modelData
                                // Return acts on release, like the image picker, so the key release stays with this tile.
                                Keys.onReturnPressed: event => { event.accepted = true }
                                Keys.onReleased: event => {
                                    if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && !event.isAutoRepeat) {
                                        event.accepted = true
                                        dialog.useTake(modelData)
                                    }
                                }
                                Rectangle {
                                    anchors.fill: parent
                                    color: Ui.Theme.surfaceInput
                                    radius: Ui.Metrics.radiusControl
                                    Image {
                                        id: takeImage
                                        anchors.fill: parent
                                        anchors.margins: Ui.Metrics.micro
                                        source: dialog.library && dialog.library.imageUrls[take.modelData] ? dialog.library.imageUrls[take.modelData] : ""
                                        asynchronous: true
                                        fillMode: Image.PreserveAspectFit
                                        sourceSize: Qt.size(width * 2, height * 2)
                                        visible: status === Image.Ready
                                    }
                                    Ui.Text {
                                        anchors.centerIn: parent
                                        visible: !takeImage.visible && (takeImage.status === Image.Error || takeImage.source == "")
                                        text: "No image"
                                        role: Ui.Typography.SansCaption
                                        tone: Ui.Text.Secondary
                                    }
                                    Rectangle {
                                        anchors.fill: parent
                                        radius: parent.radius
                                        color: take.chosen ? Ui.Theme.actionSelected : takeHover.hovered ? Ui.Theme.actionHover : "transparent"
                                        border.width: take.chosen || take.activeFocus ? Ui.Metrics.focus : Ui.Metrics.border
                                        border.color: take.activeFocus ? Ui.Theme.borderFocus : take.chosen ? Ui.Theme.accentPrimary : Ui.Theme.borderSubtle
                                    }
                                }
                                HoverHandler { id: takeHover }
                                MouseArea {
                                    anchors.fill: parent
                                    onPressed: take.forceActiveFocus(Qt.MouseFocusReason)
                                    // A second release within the platform's interval is a double click.
                                    onReleased: {
                                        const now = dialog.takeTime()
                                        const again = now - take.lastRelease <= Application.styleHints.mouseDoubleClickInterval
                                        take.lastRelease = again ? 0 : now
                                        dialog.chosenTake = take.modelData
                                        if (again) dialog.useTake(take.modelData)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        RowLayout {
            objectName: "entityReferenceProgress"
            visible: dialog.generating
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Ui.BusyIndicator { running: parent.visible; accessibleName: "Creating your reference image" }
            Ui.Text { text: "Creating your reference image…"; role: Ui.Typography.SansBody; tone: Ui.Text.Secondary }
        }
        Ui.Text {
            objectName: "entityReferenceBlockerStacked"
            visible: dialog.blocker !== "" && !dialog.choosing && !dialog.generating && !footer.reasonFits
            Layout.fillWidth: true
            text: dialog.blocker
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            wrapMode: Text.Wrap
        }
        RowLayout {
            id: footer
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            readonly property bool reasonFits: reasonProbe.implicitWidth <= width - cancel.implicitWidth - generate.implicitWidth - 2 * spacing
            Ui.Text { id: reasonProbe; visible: false; text: dialog.blocker; role: Ui.Typography.SansCaption }
            Ui.Text {
                objectName: "entityReferenceBlocker"
                visible: dialog.blocker !== "" && !dialog.choosing && !dialog.generating && footer.reasonFits
                Layout.fillWidth: true
                text: dialog.blocker
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
            Item { visible: !(dialog.blocker !== "" && !dialog.choosing && !dialog.generating && footer.reasonFits); Layout.fillWidth: true }
            Ui.EditorButton {
                objectName: "entityReferenceBack"
                visible: dialog.choosing
                density: Ui.EditorButton.Compact
                text: "Back to prompt"
                onClicked: dialog.assist.cancelReference()
            }
            Ui.EditorButton {
                id: cancel
                objectName: "entityReferenceCancel"
                density: Ui.EditorButton.Compact
                text: "Cancel"
                onClicked: dialog.close()
            }
            Ui.EditorButton {
                id: generate
                objectName: "entityReferenceGenerate"
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Primary
                text: dialog.choosing ? "Use this take" : dialog.generating ? "Generating…" : "Generate reference"
                enabled: dialog.choosing ? dialog.chosenTake !== "" : dialog.blocker === ""
                loading: dialog.generating
                onClicked: { if (dialog.choosing) dialog.useTake(dialog.chosenTake); else dialog.generate() }
            }
        }
    }
}
