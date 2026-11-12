// nt-panel: slot=right id=music order=4 title="Music"
// The music panel (docs/MUSIC-MODE.md section 15, UI-2), parts 1 to 5: the
// target track and its role, the operation the planner infers for the range,
// the prompt with the project's prompt history, candidates, seed and model,
// and the Generate button. The job list and the take list come later.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    objectName: "musicPanel"
    implicitWidth: Ui.Metrics.dialogCompactWidth
    implicitHeight: parent && parent.parent ? parent.parent.height : Ui.Metrics.dialogCompactWidth
    color: Ui.Theme.surfaceCanvas

    function editorAbove() {
        let item = parent
        while (item) {
            if (item.timeline !== undefined && item.clock !== undefined) return item
            item = item.parent
        }
        return null
    }
    function findGestures(item) {
        if (!item) return null
        if (item.gestures !== undefined && item.gestures !== null) return item.gestures
        const children = item.children || []
        for (let i = 0; i < children.length; ++i) {
            const found = findGestures(children[i])
            if (found) return found
        }
        return null
    }
    property var editor: null
    property var gestures: null
    function attach() {
        editor = editorAbove()
        gestures = findGestures(editor)
    }
    Component.onCompleted: Qt.callLater(attach)
    onParentChanged: Qt.callLater(attach)

    MusicPanelModel {
        id: plan
        objectName: "musicPanelModel"
        timeline: root.editor ? root.editor.timeline : null
        selection: root.gestures ? root.gestures.musicSelection : null
    }
    MusicSequenceState {
        id: sequence
        timeline: root.editor ? root.editor.timeline : null
    }

    // What a submission sends (read by the job module of a later milestone).
    readonly property string targetTrackId: plan.trackId
    readonly property double targetStartFrame: plan.startFrame
    readonly property double targetEndFrame: plan.endFrame
    readonly property string operation: plan.refusal === "" ? plan.operation : ""
    property string prompt: ""
    property int candidates: 2
    property bool randomSeed: true
    property int fixedSeed: 0
    // -1 asks the backend for a random seed.
    readonly property int seed: randomSeed ? -1 : fixedSeed
    property string modelChoice: ""
    readonly property string model: {
        const options = plan.modelOptions
        for (const option of options) {
            if (option.value === modelChoice) return modelChoice
        }
        return options.length > 0 ? options[0].value : ""
    }
    readonly property bool generateEnabled: false
    readonly property string generateReason: plan.refusal !== "" ? plan.reason
        : qsTr("Generation is not available in this version yet.")

    component SectionLabel: Ui.Text {
        width: parent ? parent.width : 0
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Secondary
    }

    Ui.EmptyState {
        objectName: "musicPanelEmpty"
        anchors.centerIn: parent
        visible: !plan.hasTarget
        maxTextWidth: Math.min(root.width - Ui.Metrics.xxl, Ui.Metrics.dialogCompactWidth)
        title: qsTr("No range selected")
        message: qsTr("Choose the Range tool and drag across bars on an audio track.")
        actionText: root.gestures && root.gestures.activeTool !== "range" ? qsTr("Use the Range tool") : ""
        onActionTriggered: if (root.gestures) root.gestures.activeTool = "range"
    }

    Flickable {
        id: viewport
        objectName: "musicPanelViewport"
        anchors.fill: parent
        anchors.leftMargin: Ui.Metrics.lg
        anchors.rightMargin: Ui.Metrics.lg
        anchors.topMargin: Ui.Metrics.md
        visible: plan.hasTarget
        contentWidth: width
        contentHeight: content.height + Ui.Metrics.xl
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: Ui.ScrollBar { id: scrollBar }
        Column {
            id: content
            width: viewport.width - scrollBar.width
            spacing: Ui.Metrics.xl

            // 1. The target.
            Column {
                width: parent.width
                spacing: Ui.Metrics.sm
                SectionLabel { text: qsTr("TARGET") }
                Ui.Text {
                    objectName: "musicTargetTrack"
                    width: parent.width
                    text: plan.trackName || qsTr("Untitled track")
                    role: Ui.Typography.SansLabel
                    elide: Text.ElideRight
                }
                Ui.Select {
                    objectName: "musicRolePicker"
                    width: parent.width
                    accessibleName: qsTr("Track role")
                    options: MusicProjectRules.roles
                    value: plan.trackRole
                    onValueCommitted: value => plan.setTrackRole(value)
                }
                Ui.Text {
                    objectName: "musicTargetRange"
                    width: parent.width
                    text: plan.rangeText + (plan.lengthText ? " · " + plan.lengthText : "")
                    role: Ui.Typography.MonoLabel
                    tone: Ui.Text.Secondary
                }
            }

            // 2. The operation: the inferred one is selected, and an invalid one says why.
            Column {
                width: parent.width
                spacing: Ui.Metrics.sm
                SectionLabel { text: qsTr("OPERATION") }
                Row {
                    objectName: "musicOperations"
                    width: parent.width
                    spacing: Ui.Metrics.xs
                    Repeater {
                        model: plan.operations
                        delegate: Ui.EditorButton {
                            required property var modelData
                            objectName: "musicOperation_" + modelData.value
                            width: (parent.width - 2 * parent.spacing) / 3
                            density: Ui.EditorButton.Compact
                            text: modelData.label
                            checkable: true
                            checked: plan.operation === modelData.value
                            active: checked
                            enabled: modelData.enabled
                            disabledReason: modelData.reason
                            onClicked: plan.operationChoice = modelData.value
                        }
                    }
                }
                Ui.Text {
                    objectName: "musicOperationReason"
                    width: parent.width
                    text: plan.reason
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: plan.refusal !== "" ? Ui.Text.Warning : Ui.Text.Secondary
                }
            }

            // 3. The prompt, with the project's prompt history.
            Column {
                width: parent.width
                spacing: Ui.Metrics.sm
                SectionLabel { text: qsTr("PROMPT") }
                Ui.TextArea {
                    objectName: "musicPrompt"
                    width: parent.width
                    height: Ui.Metrics.touch * 2
                    value: root.prompt
                    accessibleName: qsTr("Prompt")
                    wrapMode: TextEdit.Wrap
                    placeholderText: qsTr("Describe the music, such as warm Rhodes chords with a slow groove")
                    onValuePreviewed: value => root.prompt = value
                    onValueCommitted: value => root.prompt = value
                }
                Ui.Text {
                    width: parent.width
                    visible: sequence.promptHistory.length === 0
                    text: qsTr("Prompts you generate with are listed here.")
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Repeater {
                    objectName: "musicPromptHistory"
                    model: sequence.promptHistory
                    delegate: Ui.ListRow {
                        id: historyRow
                        required property string modelData
                        required property int index
                        objectName: "musicPromptHistory_" + index
                        width: parent.width
                        implicitHeight: Ui.Metrics.compact
                        accessibleName: qsTr("Use prompt: ") + modelData
                        onClicked: root.prompt = modelData
                        Ui.Text {
                            anchors.verticalCenter: parent.verticalCenter
                            width: parent.width
                            text: historyRow.modelData
                            elide: Text.ElideRight
                            role: Ui.Typography.SansCaption
                        }
                    }
                }
            }

            // 4. Candidates, seed and model.
            Column {
                width: parent.width
                spacing: Ui.Metrics.sm
                SectionLabel { text: qsTr("TAKES") }
                Row {
                    width: parent.width
                    spacing: Ui.Metrics.md
                    Column {
                        width: (parent.width - parent.spacing) / 2
                        spacing: Ui.Metrics.xs
                        Ui.Text { text: qsTr("Candidates"); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                        Ui.NumberField {
                            objectName: "musicCandidates"
                            width: parent.width
                            density: Ui.EditorButton.Compact
                            from: 1
                            to: 4
                            value: root.candidates
                            accessibleName: qsTr("Candidates")
                            errorText: qsTr("1 to 4")
                            valid: Number.isInteger(Number(text))
                            onValueCommitted: value => root.candidates = Math.round(value)
                        }
                    }
                    Column {
                        width: (parent.width - parent.spacing) / 2
                        spacing: Ui.Metrics.xs
                        Ui.Text { text: qsTr("Seed"); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                        Ui.Select {
                            objectName: "musicSeedMode"
                            width: parent.width
                            density: Ui.EditorButton.Compact
                            accessibleName: qsTr("Seed")
                            options: [{label: qsTr("Random"), value: true}, {label: qsTr("Fixed"), value: false}]
                            value: root.randomSeed
                            onValueCommitted: value => root.randomSeed = value
                        }
                    }
                }
                Ui.NumberField {
                    objectName: "musicSeed"
                    visible: !root.randomSeed
                    width: parent.width
                    density: Ui.EditorButton.Compact
                    from: 0
                    to: 2147483647
                    value: root.fixedSeed
                    accessibleName: qsTr("Fixed seed")
                    errorText: qsTr("A whole number from 0")
                    valid: Number.isInteger(Number(text))
                    onValueCommitted: value => root.fixedSeed = Math.round(value)
                }
                Ui.Text { text: qsTr("Model"); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                Ui.Select {
                    objectName: "musicModel"
                    width: parent.width
                    density: Ui.EditorButton.Compact
                    accessibleName: qsTr("Model")
                    enabled: plan.modelOptions.length > 1
                    options: plan.modelOptions
                    value: root.model
                    onValueCommitted: value => root.modelChoice = value
                }
            }

            // 5. Generate.
            Column {
                width: parent.width
                spacing: Ui.Metrics.sm
                Ui.EditorButton {
                    objectName: "musicGenerate"
                    width: parent.width
                    variant: Ui.EditorButton.Primary
                    text: qsTr("Generate")
                    enabled: root.generateEnabled
                    disabledReason: root.generateReason
                }
                Ui.Text {
                    objectName: "musicGenerateReason"
                    width: parent.width
                    visible: !root.generateEnabled
                    text: root.generateReason
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
            }
        }
    }
}
