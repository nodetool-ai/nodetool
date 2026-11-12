// nt-panel: slot=right id=music order=4 title="Music"
// The music panel (docs/MUSIC-MODE.md section 15, UI-2), top to bottom: the target
// track and its role, the operation the planner infers for the range with the plan
// summary, the prompt with the project's prompt history, candidates, seed and
// model, the primary action (or the first-use setup while the server lacks the
// music engine), the job list, the takes of the clip under the range, and the
// backend status line. Layout and copy follow the music mode mockup
// (native/timeline/docs/music-mode-mockup.html).
//
// The job module is the timeline's one MusicJobs (MusicJobsRegistry), which the
// assistant commands and the take clean-up share, so jobs keep running while this
// panel is hidden. The setup state belongs to the editor (TimelineEditor.qml
// `musicSetup`).
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
        if (setup) setup.refresh()
    }
    Component.onCompleted: Qt.callLater(attach)
    onParentChanged: Qt.callLater(attach)

    readonly property var jobs: editor && editor.timeline ? MusicJobsRegistry.forTimeline(editor.timeline) : null
    readonly property var setup: editor && editor.musicSetup !== undefined ? editor.musicSetup : null

    MusicPanelModel {
        id: plan
        objectName: "musicPanelModel"
        timeline: root.editor ? root.editor.timeline : null
        selection: root.gestures ? root.gestures.musicSelection : null
        candidates: root.candidates
    }
    MusicSequenceState {
        id: sequence
        timeline: root.editor ? root.editor.timeline : null
    }
    // What the ruler's context bracket shows (MusicContextBracket.qml): the planner's window
    // for Regenerate and Add instrument, or the open record of the active take.
    readonly property alias planModel: plan
    readonly property var recordContext: takeList.recordContext

    // What a submission sends.
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
    // The last refusal of a submission, cleared by the next edit of the inputs.
    property string submitError: ""
    onPromptChanged: submitError = ""
    onOperationChanged: submitError = ""

    // The server can run the chosen operation (BE-5). Add instrument needs the base model too.
    readonly property bool setupSatisfied: !!setup && (operation === "lego" ? setup.addInstrumentReady : setup.ready)
    readonly property bool setupShown: !!setup && operation !== ""
        && (setup.state === "setup" || (operation === "lego" && setup.state === "ready" && !setup.addInstrumentReady))
    readonly property bool generateEnabled: operation !== "" && prompt.trim() !== "" && setupSatisfied
        && !!jobs && jobs.activeCount < 8
    readonly property string generateReason: {
        if (plan.refusal !== "") return plan.reason
        if (operation === "") return qsTr("Choose an operation for this range.")
        if (!setup || setup.state === "offline") return qsTr("Open a timeline from a NodeTool server to generate music.")
        if (setup.state === "checking") return qsTr("Checking the music engine on the server…")
        if (setup.state === "error") return setup.message || qsTr("The server did not answer. Check that it is running.")
        if (!setupSatisfied) return qsTr("Set up music generation first.")
        if (prompt.trim() === "") return qsTr("Describe the part to generate.")
        if (jobs && jobs.activeCount >= 8) return qsTr("Eight jobs are active on this timeline. Wait for one to finish.")
        return ""
    }
    readonly property string shortcutLabel: Qt.platform.os === "osx" ? "⌘↵" : "Ctrl+Enter"

    // Records the prompt (TK-6), then submits the panel's values (section 9).
    // The history edit comes first, so Undo after a submission removes the
    // placeholder before it touches the history.
    function generate() {
        if (!generateEnabled) return false
        const text = prompt.trim()
        plan.recordPrompt(text)
        const id = jobs.submit(targetTrackId, targetStartFrame, targetEndFrame, operation, text, candidates, seed, model, {})
        submitError = id === "" ? jobs.error : ""
        return id !== ""
    }

    component SectionHeader: Row {
        id: header
        property string title
        property string note
        width: parent ? parent.width : 0
        Ui.Text {
            id: headerTitle
            text: header.title
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
        }
        Ui.Text {
            width: header.width - headerTitle.width
            text: header.note
            horizontalAlignment: Text.AlignRight
            elide: Text.ElideLeft
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
        }
    }
    component FieldLabel: Ui.Text {
        width: Ui.Metrics.xxxl * 2.5
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Secondary
    }

    Ui.EmptyState {
        objectName: "musicPanelEmpty"
        anchors.centerIn: parent
        visible: !plan.hasTarget
        maxTextWidth: Math.min(root.width - Ui.Metrics.xxl, Ui.Metrics.dialogCompactWidth)
        title: qsTr("No range selected")
        message: qsTr("Select a bar range on a track. Drag on a lane with the Range tool, or double-click a clip to take its span.")
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
                spacing: Ui.Metrics.xs
                SectionHeader { title: qsTr("TARGET") }
                Ui.Text {
                    objectName: "musicTargetTrack"
                    width: parent.width
                    text: plan.targetTitle
                    role: Ui.Typography.SansTitle
                    elide: Text.ElideRight
                }
                Ui.Text {
                    objectName: "musicTargetRange"
                    width: parent.width
                    text: plan.targetDetail
                    role: Ui.Typography.MonoCaption
                    tone: Ui.Text.Secondary
                }
                Ui.Select {
                    objectName: "musicRolePicker"
                    width: parent.width
                    density: Ui.EditorButton.Compact
                    accessibleName: qsTr("Track role")
                    options: MusicProjectRules.roles
                    value: plan.trackRole
                    onValueCommitted: value => plan.setTrackRole(value)
                }
            }

            // 2. The operation: the inferred one carries AUTO, an invalid one says why.
            Column {
                width: parent.width
                spacing: Ui.Metrics.sm
                SectionHeader { title: qsTr("OPERATION") }
                Row {
                    objectName: "musicOperations"
                    width: parent.width
                    spacing: Ui.Metrics.xs
                    Repeater {
                        model: plan.operations
                        delegate: Ui.EditorButton {
                            id: operationButton
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
                            Ui.Text {
                                objectName: "musicOperationAuto_" + operationButton.modelData.value
                                visible: plan.inferred === operationButton.modelData.value
                                anchors.right: parent.right
                                anchors.top: parent.top
                                anchors.rightMargin: Ui.Metrics.xs
                                text: qsTr("AUTO")
                                role: Ui.Typography.MonoCaption
                                tone: Ui.Text.Info
                            }
                        }
                    }
                }
                Ui.Text {
                    objectName: "musicOperationReason"
                    visible: plan.refusal === ""
                    width: parent.width
                    text: plan.reason
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Ui.Status {
                    objectName: "musicOperationRefusal"
                    visible: plan.refusal !== ""
                    width: parent.width
                    wrap: true
                    status: Ui.Status.Error
                    message: plan.refusal !== "" ? plan.reason : ""
                }
                Rectangle {
                    objectName: "musicPlanSummary"
                    visible: plan.planSummary.length > 0
                    width: parent.width
                    height: summaryLines.height + 2 * Ui.Metrics.md
                    radius: Ui.Metrics.radiusControl
                    color: Ui.Theme.surfaceOverlay
                    border.width: Ui.Metrics.border
                    border.color: Ui.Theme.borderSubtle
                    Column {
                        id: summaryLines
                        x: Ui.Metrics.md
                        y: Ui.Metrics.md
                        width: parent.width - 2 * Ui.Metrics.md
                        Repeater {
                            model: plan.planSummary
                            delegate: Ui.Text {
                                required property string modelData
                                width: summaryLines.width
                                text: modelData
                                wrapMode: Text.WordWrap
                                role: Ui.Typography.MonoCaption
                            }
                        }
                    }
                }
            }

            // 3 and 4. The prompt, its history, candidates, seed and model.
            Column {
                visible: root.operation !== ""
                width: parent.width
                spacing: Ui.Metrics.sm
                SectionHeader { title: qsTr("PROMPT") }
                Ui.TextArea {
                    id: promptField
                    objectName: "musicPrompt"
                    width: parent.width
                    height: Ui.Metrics.touch * 2
                    value: root.prompt
                    accessibleName: qsTr("Prompt")
                    wrapMode: TextEdit.Wrap
                    placeholderText: qsTr("Describe the part: style, instrument, feel")
                    onValuePreviewed: value => root.prompt = value
                    onValueCommitted: value => root.prompt = value
                }
                Shortcut {
                    sequences: ["Ctrl+Return", "Ctrl+Enter"]
                    context: Qt.WindowShortcut
                    enabled: promptField.activeFocus
                    onActivated: root.generate()
                }
                // The project's prompt history: the four newest fill the field on a click.
                Flow {
                    objectName: "musicPromptHistory"
                    width: parent.width
                    spacing: Ui.Metrics.xs
                    Repeater {
                        model: sequence.promptHistory.slice(0, 4)
                        delegate: Ui.EditorButton {
                            required property string modelData
                            required property int index
                            objectName: "musicPromptHistory_" + index
                            width: Math.min(implicitWidth, parent.width)
                            density: Ui.EditorButton.Compact
                            variant: Ui.EditorButton.Flat
                            text: modelData
                            textRole: Ui.Typography.SansCaption
                            accessibleName: qsTr("Use prompt: ") + modelData
                            onClicked: root.prompt = modelData
                        }
                    }
                }
                Row {
                    width: parent.width
                    spacing: Ui.Metrics.sm
                    FieldLabel { anchors.verticalCenter: parent.verticalCenter; text: qsTr("Candidates") }
                    Row {
                        objectName: "musicCandidates"
                        spacing: Ui.Metrics.xs
                        Ui.EditorButton {
                            objectName: "musicCandidatesFewer"
                            density: Ui.EditorButton.Compact
                            iconName: "remove"
                            accessibleName: qsTr("Fewer candidates")
                            enabled: root.candidates > 1
                            disabledReason: qsTr("One candidate is the least.")
                            onClicked: root.candidates = Math.max(1, root.candidates - 1)
                        }
                        Ui.Text {
                            objectName: "musicCandidatesValue"
                            anchors.verticalCenter: parent.verticalCenter
                            width: Ui.Metrics.xl
                            horizontalAlignment: Text.AlignHCenter
                            text: root.candidates
                            role: Ui.Typography.MonoLabel
                        }
                        Ui.EditorButton {
                            objectName: "musicCandidatesMore"
                            density: Ui.EditorButton.Compact
                            iconName: "add"
                            accessibleName: qsTr("More candidates")
                            enabled: root.candidates < 4
                            disabledReason: qsTr("Four candidates is the most.")
                            onClicked: root.candidates = Math.min(4, root.candidates + 1)
                        }
                    }
                }
                Row {
                    width: parent.width
                    spacing: Ui.Metrics.sm
                    FieldLabel { anchors.verticalCenter: parent.verticalCenter; text: qsTr("Seed") }
                    Ui.Select {
                        id: seedMode
                        objectName: "musicSeedMode"
                        width: Ui.Metrics.xxxl * 3
                        density: Ui.EditorButton.Compact
                        accessibleName: qsTr("Seed")
                        options: [{label: qsTr("Random"), value: true}, {label: qsTr("Fixed"), value: false}]
                        value: root.randomSeed
                        onValueCommitted: value => root.randomSeed = value
                    }
                    Ui.NumberField {
                        objectName: "musicSeed"
                        width: parent.width - x
                        enabled: !root.randomSeed
                        density: Ui.EditorButton.Compact
                        from: 0
                        to: 2147483647
                        value: root.fixedSeed
                        accessibleName: qsTr("Fixed seed")
                        errorText: qsTr("A whole number from 0")
                        valid: Number.isInteger(Number(text))
                        onValueCommitted: value => root.fixedSeed = Math.round(value)
                    }
                }
                Row {
                    width: parent.width
                    spacing: Ui.Metrics.sm
                    FieldLabel { anchors.verticalCenter: parent.verticalCenter; text: qsTr("Model") }
                    Ui.Select {
                        objectName: "musicModel"
                        width: parent.width - x
                        density: Ui.EditorButton.Compact
                        accessibleName: qsTr("Model")
                        enabled: plan.modelOptions.length > 1
                        options: plan.modelOptions
                        value: root.model
                        onValueCommitted: value => root.modelChoice = value
                    }
                }
            }

            // 5. The primary action, or the first-use setup in its place.
            Column {
                width: parent.width
                spacing: Ui.Metrics.sm
                MusicSetup {
                    objectName: "musicSetupView"
                    visible: root.setupShown
                    width: parent.width
                    setup: root.setup
                    operation: root.operation
                }
                Ui.EditorButton {
                    objectName: "musicGenerate"
                    visible: !root.setupShown
                    width: parent.width
                    variant: Ui.EditorButton.Primary
                    text: plan.actionLabel || qsTr("Generate")
                    shortcutText: root.shortcutLabel
                    enabled: root.generateEnabled
                    disabledReason: root.generateReason
                    onClicked: root.generate()
                }
                Ui.Text {
                    objectName: "musicGenerateReason"
                    width: parent.width
                    visible: !root.setupShown && !root.generateEnabled
                    text: root.generateReason
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Ui.Banner {
                    objectName: "musicSetupError"
                    visible: !!root.setup && root.setup.state === "error"
                    width: parent.width
                    status: Ui.Status.Error
                    message: root.generateReason
                    actionText: qsTr("Check again")
                    onActionTriggered: root.setup.refresh()
                }
                Ui.Status {
                    objectName: "musicSubmitError"
                    visible: root.submitError !== ""
                    width: parent.width
                    wrap: true
                    status: Ui.Status.Error
                    message: root.submitError
                }
            }

            // 6. Jobs.
            Column {
                width: parent.width
                spacing: Ui.Metrics.sm
                SectionHeader { title: qsTr("JOBS"); note: qsTr("one at a time on this machine") }
                MusicJobList {
                    width: parent.width
                    jobs: root.jobs
                }
            }

            // 7. Takes of the clip under the range.
            Column {
                width: parent.width
                spacing: Ui.Metrics.sm
                SectionHeader { title: qsTr("TAKES"); note: plan.takeClipTitle }
                MusicTakeList {
                    id: takeList
                    width: parent.width
                    plan: plan
                    jobs: root.jobs
                }
            }

            // 8. The backend status line.
            Row {
                objectName: "musicBackendStatus"
                width: parent.width
                spacing: Ui.Metrics.sm
                Ui.StatusDot {
                    anchors.verticalCenter: parent.verticalCenter
                    active: root.setupSatisfied
                }
                Ui.Text {
                    objectName: "musicBackendStatusText"
                    width: parent.width - x
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    text: {
                        const setup = root.setup
                        if (!setup || setup.state === "offline") return qsTr("No server timeline is open")
                        if (setup.state === "checking") return qsTr("Checking the music engine…")
                        if (setup.state === "error") return qsTr("The server did not answer")
                        if (setup.state === "remote") return qsTr("ace-server on a remote machine")
                        if (setup.state === "ready") {
                            return setup.addInstrumentReady ? qsTr("ace-server on this server · turbo and base models installed")
                                                            : qsTr("ace-server on this server · turbo model installed")
                        }
                        return qsTr("Music generation is not set up yet")
                    }
                }
            }
        }
    }
}
