// nt-panel: slot=bottom id=audio order=15 title="Audio"
// Registered in the bottom slot so that only the Audio workspace puts it on the right: a right-slot panel would show in every
// workspace, including Review, which shows no side panel.
// PanelSlot supplies no properties. Follow the visual parent chain to the TimelineEditor
// (timeline + clock), then its TracksRegion (gestures). Outside an editor the panel shows an empty state.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    objectName: "audioPanel"
    implicitWidth: Ui.Metrics.dialogCompactWidth
    implicitHeight: parent && parent.parent ? parent.parent.height : Ui.Metrics.dialogWidth
    color: Ui.Theme.surfaceCanvas

    property var editor: null
    property var gestures: null
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
        if (item.gestures !== undefined) return item.gestures
        const children = item.children || []
        for (let i = 0; i < children.length; ++i) {
            const found = findGestures(children[i])
            if (found) return found
        }
        return null
    }
    function attach() {
        editor = editorAbove()
        gestures = findGestures(editor)
    }
    Component.onCompleted: Qt.callLater(attach)
    onParentChanged: Qt.callLater(attach)

    readonly property var selection: gestures ? gestures.selection : []
    readonly property TimelineModel timelineModel: editor ? editor.timeline : null
    readonly property AudioRoles roles: timelineModel ? AudioRolesRegistry.forTimeline(timelineModel) : null
    // Bumped on every clip change so the role of the selection is read again after an edit.
    property int revision: 0
    function summarize(revisionNow, chosen, controller) {
        return controller ? controller.roleSummary(chosen) : ({role: "", count: 0})
    }
    readonly property var summary: summarize(revision, selection, roles)
    readonly property bool hasSound: summary.count > 0
    readonly property bool busy: roles ? roles.busy : false
    Connections {
        target: root.timelineModel
        function onClipsChanged() { root.revision++ }
        function onDocumentReplaced() { root.revision++ }
    }

    readonly property var roleChoices: [
        {role: "dialogue", label: "Dialogue"},
        {role: "music", label: "Music"},
        {role: "sfx", label: "SFX"},
        {role: "ambience", label: "Ambience"}
    ]

    Flickable {
        id: viewport
        objectName: "audioViewport"
        anchors.fill: parent
        anchors.leftMargin: Ui.Metrics.lg
        anchors.rightMargin: Ui.Metrics.lg
        anchors.topMargin: Ui.Metrics.md
        contentWidth: width
        contentHeight: content.implicitHeight + Ui.Metrics.xxl
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: Ui.ScrollBar {}

        ColumnLayout {
            id: content
            width: viewport.width
            spacing: Ui.Metrics.sm

            Ui.EmptyState {
                objectName: "audioNoEditor"
                Layout.fillWidth: true
                visible: !root.roles
                title: "No timeline open"
                message: "Open a timeline to set audio roles and match loudness."
            }

            // Progress and the last result of Match loudness, Normalize and Duck.
            ColumnLayout {
                objectName: "audioStatus"
                Layout.fillWidth: true
                visible: !!root.roles && (root.busy || root.roles.message !== "")
                spacing: Ui.Metrics.sm
                RowLayout {
                    Layout.fillWidth: true
                    visible: root.busy
                    spacing: Ui.Metrics.sm
                    Ui.Progress {
                        objectName: "audioProgress"
                        Layout.fillWidth: true
                        accessibleName: "Measuring"
                        value: root.roles ? root.roles.progress : 0
                    }
                    Ui.EditorButton {
                        objectName: "audioCancel"
                        text: "Cancel"
                        density: Ui.EditorButton.Compact
                        onClicked: root.roles.cancel()
                    }
                }
                Ui.Text {
                    Layout.fillWidth: true
                    visible: root.busy
                    text: root.roles && root.roles.task === "duck" ? "Finding where the dialogue is..." : "Measuring loudness..."
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Ui.Banner {
                    objectName: "audioMessage"
                    Layout.fillWidth: true
                    visible: !root.busy && !!root.roles && root.roles.message !== ""
                    status: root.roles && root.roles.messageIsError ? Ui.Status.Error : Ui.Status.Info
                    message: root.roles ? root.roles.message : ""
                    actionText: "Dismiss"
                    onActionTriggered: root.roles.dismissMessage()
                }
            }

            InspectorSection {
                Layout.fillWidth: true
                visible: !!root.roles
                title: "Mix loudness"
                icon: "volumeUp"
                divider: false
                LoudnessMeterView {
                    width: parent.width
                    standardId: "broadcast"
                }
            }

            InspectorSection {
                Layout.fillWidth: true
                visible: !!root.roles
                title: "Role"
                icon: "graphicEq"
                Flow {
                    objectName: "audioRoles"
                    width: parent.width
                    spacing: Ui.Metrics.sm
                    Repeater {
                        model: root.roleChoices
                        delegate: Ui.EditorButton {
                            id: choice
                            required property var modelData
                            objectName: "audioRole-" + modelData.role
                            text: modelData.label
                            density: Ui.EditorButton.Compact
                            active: root.summary.role === modelData.role
                            variant: active ? Ui.EditorButton.Primary : Ui.EditorButton.Default
                            enabled: root.hasSound && !root.busy
                            disabledReason: root.busy ? "Wait for the measurement to finish." : "Select an audio clip to give it a role."
                            accessibleName: modelData.label + (active ? ", selected" : "")
                            // A role that only comes from how a clip was made (generated voice, generated music) has
                            // no field to clear, so clicking it does nothing.
                            onClicked: {
                                if (active && root.summary.explicitCount === 0) return
                                root.roles.setRole(root.selection, active ? "" : modelData.role)
                            }
                        }
                    }
                }
                Ui.Text {
                    objectName: "audioRoleHint"
                    width: parent.width
                    wrapMode: Text.Wrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    text: !root.hasSound ? "Select an audio clip to give it a role."
                        : root.summary.role === "mixed" ? "The selected clips have different roles. Choose one to give them all the same role."
                        : root.summary.role === "" ? "Choose a role for this clip."
                        : root.summary.explicitCount === 0 ? "Generated voice reads as Dialogue and generated music as Music. Choose another role to change it."
                        : "Click the chosen role again to clear it."
                }
            }

            InspectorSection {
                Layout.fillWidth: true
                visible: !!root.roles
                title: "Match loudness"
                icon: "volumeUp"
                Repeater {
                    model: root.roleChoices
                    delegate: InspectorRow {
                        id: targetRow
                        required property var modelData
                        width: parent ? parent.width : 0
                        label: modelData.label
                        Ui.NumberField {
                            objectName: "audioTarget-" + targetRow.modelData.role
                            width: Ui.Metrics.xxxl * 3
                            density: Ui.EditorButton.Compact
                            unit: "LUFS"
                            from: -60
                            to: 0
                            stepSize: 1
                            accessibleName: targetRow.modelData.label + " target loudness"
                            value: root.roles ? root.roles.targets[targetRow.modelData.role] : -23
                            displayValue: Number(value).toFixed(1)
                            onValueCommitted: value => root.roles.setTarget(targetRow.modelData.role, value)
                        }
                    }
                }
                Ui.EditorButton {
                    objectName: "audioMatch"
                    text: "Match loudness"
                    variant: Ui.EditorButton.Primary
                    density: Ui.EditorButton.Comfortable
                    enabled: !root.busy
                    disabledReason: "Wait for the measurement to finish."
                    onClicked: root.roles.matchLoudness(root.selection)
                }
                Ui.Text {
                    width: parent.width
                    wrapMode: Text.Wrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    text: "Sets each clip's volume so its loudness reaches the target for its role. Works on the selected clips, or on every clip with a role when none is selected."
                }
            }

            InspectorSection {
                Layout.fillWidth: true
                visible: !!root.roles
                title: "Duck music"
                icon: "graphicEq"
                InspectorRow {
                    width: parent.width
                    label: "Reduce by"
                    Ui.NumberField {
                        objectName: "audioDuckReduce"
                        width: Ui.Metrics.xxxl * 3
                        density: Ui.EditorButton.Compact
                        unit: "dB"
                        from: 0
                        to: 40
                        stepSize: 1
                        accessibleName: "Reduce by"
                        value: root.roles ? root.roles.duckReduceDb : 15
                        displayValue: Number(value).toFixed(1)
                        onValueCommitted: value => root.roles.duckReduceDb = value
                    }
                }
                InspectorSliderRow {
                    objectName: "audioDuckSensitivity"
                    width: parent.width
                    label: "Sensitivity"
                    min: 0
                    max: 10
                    step: 1
                    value: root.roles ? root.roles.duckSensitivity : 6
                    display: value.toFixed(0)
                    onChange: value => root.roles.duckSensitivity = value
                }
                InspectorRow {
                    width: parent.width
                    label: "Fade"
                    Ui.NumberField {
                        objectName: "audioDuckFade"
                        width: Ui.Metrics.xxxl * 3
                        density: Ui.EditorButton.Compact
                        unit: "s"
                        from: 0
                        to: 5
                        stepSize: 0.1
                        accessibleName: "Fade"
                        value: root.roles ? root.roles.duckFadeS : 0.8
                        displayValue: Number(value).toFixed(2)
                        onValueCommitted: value => root.roles.duckFadeS = value
                    }
                }
                Repeater {
                    model: [{role: "dialogue", label: "Duck under Dialogue"}, {role: "sfx", label: "Duck under SFX"}]
                    delegate: InspectorToggleRow {
                        id: against
                        required property var modelData
                        objectName: "audioDuckAgainst-" + modelData.role
                        width: parent ? parent.width : 0
                        label: modelData.label
                        checked: root.roles ? root.roles.duckAgainst.indexOf(modelData.role) >= 0 : false
                        onChange: next => {
                            const list = root.roles.duckAgainst.filter(role => role !== against.modelData.role)
                            if (next) list.push(against.modelData.role)
                            root.roles.duckAgainst = list
                        }
                    }
                }
                Ui.EditorButton {
                    objectName: "audioDuck"
                    text: "Duck music and ambience"
                    variant: Ui.EditorButton.Primary
                    density: Ui.EditorButton.Comfortable
                    enabled: !root.busy
                    disabledReason: "Wait for the measurement to finish."
                    onClicked: root.roles.duck(root.selection)
                }
                Ui.Text {
                    width: parent.width
                    wrapMode: Text.Wrap
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    text: "Lowers the track's volume while the trigger sound plays. Works on the selected Music and Ambience clips, or on all of them when none is selected. Running it again replaces the earlier ducking in the clip's range. Ducking affects the whole track, so keep Music and Ambience on tracks of their own."
                }
            }
        }
    }
}
