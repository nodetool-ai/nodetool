import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import NodeTool.ModelPicker
import "../assets/AssetContext.js" as Context

// The writing assistant for the descriptor. The field changes only when the person applies
// the proposal, and a further instruction refines the proposal rather than the field.
Ui.Popover {
    id: pop
    objectName: "entityAssistPopover"
    property var assist: null
    property string kind: "character"
    property string entityName: ""
    // The field's current text, which the editor binds so it is never a snapshot.
    property string fieldText: ""
    // The editor dialog the popover prefers to sit beside, and the control that opened it.
    property var beside: null
    property Item trigger: null
    readonly property real preferredWidth: 380 * Ui.Theme.uiScale
    // Room to the right of the editor, after a gap on each side. The popover narrows into it down to a minimum.
    readonly property real room: beside && parent ? parent.width - (beside.x + beside.width) - 2 * Ui.Metrics.md : 0
    readonly property bool sideBySide: room >= Ui.Metrics.touch * 6
    property string localError: ""
    readonly property string fieldLabel: "Descriptor"
    readonly property string fieldHelp: "Describe its appearance in a sentence. Every prompt that uses this entity includes this text exactly as written."
    readonly property alias catalog: textCatalog
    readonly property alias instructionField: instruction
    readonly property bool running: !!assist && assist.assisting
    readonly property string proposal: assist ? assist.proposal : ""
    readonly property string source: proposal !== "" ? proposal : fieldText
    readonly property bool hasSource: source.trim() !== ""
    readonly property bool modelPicked: textCatalog.selectedModelId !== "" && textCatalog.selectedProvider !== ""
    signal applied(string text)
    function submit(text) {
        const trimmed = text.trim()
        if (trimmed === "" || running) return
        if (!modelPicked) { localError = "Pick a model below before you ask the assistant."; return }
        localError = ""
        instruction.cancelEdit()
        instruction.value = ""
        instruction.text = ""
        assist.assist({provider: textCatalog.selectedProvider, model: textCatalog.selectedModelId, instruction: trimmed, text: source,
            label: fieldLabel, description: fieldHelp, context: assist.assistContext(kind, entityName)})
    }
    // Sits to the right of the editor when that fits in the window, so the descriptor and the Save button stay visible.
    // Otherwise it opens under the trigger and stays inside the window.
    function place() {
        if (!parent || !trigger) return
        if (sideBySide) {
            anchor = null
            x = beside.x + beside.width + Ui.Metrics.md
            y = Math.max(Ui.Metrics.md, Math.min(trigger.mapToItem(parent, 0, 0).y, parent.height - height - Ui.Metrics.md))
        } else {
            anchor = trigger
            positionAt(trigger)
        }
    }
    function openBeside(editor, item) {
        beside = editor
        trigger = item
        returnFocusTo = item
        place()
        open()
    }
    function reset() {
        if (assist) assist.clearProposal()
        localError = ""
        instruction.cancelEdit()
        instruction.value = ""
        instruction.text = ""
    }
    // Closes the popover and forgets its request, proposal, error and instruction.
    function dismiss() {
        close()
        reset()
    }
    function apply() {
        if (proposal === "") return
        applied(proposal)
        assist.clearProposal()
        close()
    }
    width: Math.min(preferredWidth, sideBySide ? room : parent ? parent.width - Ui.Metrics.md * 2 : preferredWidth)
    height: Math.min(implicitHeight, parent ? parent.height - Ui.Metrics.md * 2 : implicitHeight)
    // A press in the model menu is outside this popover, so only Escape and the close button close it.
    closePolicy: Popup.CloseOnEscape
    // Closing abandons the request and the proposal.
    onClosed: reset()
    onRoomChanged: if (visible) place()
    onWidthChanged: if (visible) place()
    onHeightChanged: if (visible) place()

    ModelCatalogController { id: textCatalog; objectName: "entityAssistCatalog"; mode: "language_model" }
    contentItem: ColumnLayout {
        spacing: Ui.Metrics.md
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.sm
            Ui.Icon { name: "autoAwesome"; tone: Ui.Text.Info; size: Ui.Metrics.iconMd }
            Ui.Text { Layout.fillWidth: true; text: "Writing assistant"; role: Ui.Typography.SansLabel; Accessible.role: Accessible.Heading }
            Ui.ToolbarIconButton { objectName: "entityAssistClose"; iconName: "close"; accessibleName: "Close the writing assistant"; onClicked: pop.close() }
        }
        ColumnLayout {
            objectName: "entityAssistProposal"
            visible: pop.proposal !== ""
            Layout.fillWidth: true
            spacing: Ui.Metrics.xs
            Ui.Text { Layout.fillWidth: true; text: "Suggestion"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
            Flickable {
                Layout.fillWidth: true
                Layout.preferredHeight: Math.min(proposalText.implicitHeight, Ui.Metrics.touch * 3)
                clip: true
                contentWidth: width
                contentHeight: proposalText.implicitHeight
                boundsBehavior: Flickable.StopAtBounds
                ScrollBar.vertical: Ui.ScrollBar {}
                Ui.TextArea {
                    id: proposalText
                    objectName: "entityAssistProposalText"
                    width: parent.width
                    readOnly: true
                    selectByMouse: true
                    role: Ui.Typography.SansLabel
                    accessibleName: "Suggestion"
                    value: pop.proposal
                }
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: Ui.Metrics.md
                Item { Layout.fillWidth: true }
                Ui.EditorButton {
                    objectName: "entityAssistDiscard"
                    density: Ui.EditorButton.Compact
                    text: "Discard"
                    enabled: !pop.running
                    onClicked: pop.assist.clearProposal()
                }
                Ui.EditorButton {
                    objectName: "entityAssistApply"
                    density: Ui.EditorButton.Compact
                    variant: Ui.EditorButton.Primary
                    text: pop.fieldText.trim() !== "" ? "Replace text" : "Insert"
                    enabled: !pop.running
                    onClicked: pop.apply()
                }
            }
        }
        RowLayout {
            objectName: "entityAssistRunning"
            visible: pop.running
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Ui.BusyIndicator { running: parent.visible; accessibleName: "Writing" }
            Ui.Text { Layout.fillWidth: true; text: "Writing"; role: Ui.Typography.SansBody; tone: Ui.Text.Secondary }
            Ui.EditorButton { objectName: "entityAssistStop"; density: Ui.EditorButton.Compact; text: "Stop"; onClicked: pop.assist.cancelAssist() }
        }
        Flow {
            objectName: "entityAssistActions"
            visible: !pop.running
            Layout.fillWidth: true
            spacing: Ui.Metrics.xs
            Repeater {
                model: pop.assist ? pop.assist.quickActions : []
                Ui.EditorButton {
                    required property var modelData
                    objectName: "entityAssistAction_" + modelData.id
                    density: Ui.EditorButton.Compact
                    text: modelData.label
                    enabled: !modelData.needsText || pop.hasSource
                    onClicked: pop.submit(modelData.instruction)
                }
            }
        }
        Ui.Text {
            objectName: "entityAssistReason"
            visible: !pop.running && !pop.hasSource
            Layout.fillWidth: true
            text: "The other actions need text. Write it first, or ask the assistant to write it."
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            wrapMode: Text.Wrap
        }
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.xs
            Ui.TextField {
                id: instruction
                objectName: "entityAssistInstruction"
                Layout.fillWidth: true
                enabled: !pop.running
                accessibleName: "Instruction"
                placeholderText: pop.proposal !== "" ? "Refine the suggestion…" : "Tell the assistant what to write…"
                selectByMouse: true
                onAccepted: pop.submit(text)
            }
            Ui.ToolbarIconButton {
                objectName: "entityAssistSend"
                variant: Ui.EditorButton.Primary
                iconName: "arrowUpward"
                accessibleName: "Send the instruction"
                enabled: instruction.text.trim() !== "" && !pop.running
                onClicked: pop.submit(instruction.text)
            }
        }
        Ui.Banner {
            objectName: "entityAssistError"
            visible: pop.localError !== "" || (!!pop.assist && pop.assist.assistError !== "")
            Layout.fillWidth: true
            status: Ui.Status.Error
            message: pop.localError !== "" ? pop.localError : pop.assist ? pop.assist.assistError : ""
        }
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Ui.Text { text: "Model"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
            ModelPickerButton {
                objectName: "entityAssistModel"
                Layout.fillWidth: true
                catalog: textCatalog
                placeholder: "Model for writing"
                Accessible.name: "Model for writing"
                onAddProvidersRequested: {
                    const window = pop.parent ? pop.parent.Window.window : null
                    const settings = Context.itemNamed(window ? window.contentItem : null, "providerSettingsDialog")
                    if (settings) settings.open()
                }
            }
        }
    }
}
