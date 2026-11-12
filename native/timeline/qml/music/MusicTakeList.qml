// The take list of the music panel (docs/MUSIC-MODE.md section 15, part 7): the
// takes of the clip under the range, each with its label, task, seed, alignment
// offset and a drifting badge (AL-4, AL-5), and its generation record (TK-3).
// Clicking a take makes it active through `music.selectTake` (TK-2). Delete
// removes the take from the clip and keeps its asset (TK-5). Run again replays
// the take's record with the same or a new seed (TK-4). Copy follows the music
// mode mockup.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Column {
    id: root
    objectName: "musicTakeList"
    // The panel's MusicPanelModel and the editor's MusicJobs.
    property var plan: null
    property var jobs: null
    // A job runs for the clip under the range.
    readonly property bool jobRunning: !!plan && !!jobs && plan.takeClipId !== "" && jobs.clipJobs[plan.takeClipId] !== undefined
        && jobs.clipJobs[plan.takeClipId].state !== "failed"
    spacing: Ui.Metrics.sm
    // The takes whose generation record is open, kept while the document changes under the cards.
    property var openIds: []
    // The context window of the active take when its record is open, for the ruler bracket:
    // {label, startFrame, endFrame}, or null.
    readonly property var recordContext: {
        for (const take of plan ? plan.takes : []) {
            if (take.active && take.contextLabel !== "" && openIds.indexOf(take.id) >= 0)
                return {label: take.contextLabel, startFrame: take.contextStartFrame, endFrame: take.contextEndFrame}
        }
        return null
    }
    readonly property string clipId: plan ? plan.takeClipId : ""
    onClipIdChanged: openIds = []
    function toggleRecord(id) {
        openIds = openIds.indexOf(id) >= 0 ? openIds.filter(other => other !== id) : openIds.concat([id])
    }

    Ui.Text {
        objectName: "musicTakesEmpty"
        visible: text !== ""
        width: parent.width
        text: !root.plan || root.plan.takeClipId === "" ? qsTr("Select a range inside a clip to see its takes.")
            : root.plan.takeClipPending || root.jobRunning && root.plan.takes.length === 0 ? qsTr("Takes appear here when the job finishes.")
            : ""
        wrapMode: Text.WordWrap
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Secondary
    }

    Repeater {
        model: root.plan && !root.plan.takeClipPending ? root.plan.takes : []
        delegate: Rectangle {
            id: card
            required property var modelData
            required property int index
            readonly property bool recordOpen: root.openIds.indexOf(modelData.id) >= 0
            objectName: "musicTake_" + index
            width: root.width
            height: content.height + 2 * Ui.Metrics.md
            radius: Ui.Metrics.radiusCard
            color: modelData.active ? Ui.Theme.actionSelected : Ui.Theme.surfacePanel
            border.width: modelData.active ? Ui.Metrics.focus : Ui.Metrics.border
            border.color: modelData.active ? Ui.Theme.borderFocus : Ui.Theme.borderSubtle

            Column {
                id: content
                x: Ui.Metrics.md
                y: Ui.Metrics.md
                width: parent.width - 2 * Ui.Metrics.md
                spacing: Ui.Metrics.xs
                Row {
                    width: parent.width
                    spacing: Ui.Metrics.sm
                    Ui.EditorButton {
                        id: pick
                        objectName: "musicTakeSelect"
                        width: parent.width - actions.width - parent.spacing
                        variant: Ui.EditorButton.Flat
                        density: Ui.EditorButton.Compact
                        contentAlignment: Qt.AlignLeft
                        iconName: card.modelData.active ? "check" : ""
                        text: card.modelData.label
                        accessibleName: qsTr("Make %1 active").arg(card.modelData.label)
                        description: card.modelData.active ? qsTr("The clip plays this take.") : ""
                        onClicked: if (!card.modelData.active) root.plan.selectTake(card.modelData.id)
                    }
                    Row {
                        id: actions
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Ui.Metrics.xs
                        Ui.EditorButton {
                            id: again
                            objectName: "musicTakeRegenerate"
                            visible: card.modelData.canRegenerate
                            density: Ui.EditorButton.Compact
                            variant: Ui.EditorButton.Flat
                            iconName: "refresh"
                            accessibleName: qsTr("Run %1 again").arg(card.modelData.label)
                            description: qsTr("Run this take's request again")
                            enabled: !!root.jobs
                            onClicked: againMenu.openAt(again)
                        }
                        Ui.EditorButton {
                            objectName: "musicTakeDelete"
                            density: Ui.EditorButton.Compact
                            variant: Ui.EditorButton.Flat
                            iconName: "close"
                            accessibleName: qsTr("Delete %1").arg(card.modelData.label)
                            description: qsTr("Delete the take. Its audio stays in the library.")
                            enabled: card.modelData.canDelete
                            disabledReason: card.modelData.deleteReason
                            onClicked: root.plan.deleteTake(card.modelData.id)
                        }
                    }
                }
                Row {
                    spacing: Ui.Metrics.sm
                    Ui.Text {
                        objectName: "musicTakeTask"
                        visible: text !== ""
                        text: card.modelData.task
                        role: Ui.Typography.MonoCaption
                        tone: Ui.Text.Secondary
                    }
                    Rectangle {
                        id: driftBadge
                        objectName: "musicTakeDrifting"
                        visible: card.modelData.drifting
                        width: driftText.implicitWidth + 2 * Ui.Metrics.xs
                        height: driftText.implicitHeight
                        radius: Ui.Metrics.radiusControl
                        color: Ui.Theme.statusWarningSurface
                        Accessible.role: Accessible.StaticText
                        Accessible.name: card.modelData.driftText
                        Ui.Text {
                            id: driftText
                            anchors.centerIn: parent
                            text: qsTr("drifting")
                            role: Ui.Typography.MonoCaption
                            domainColor: Ui.Theme.statusWarningOnSurface
                        }
                        HoverHandler { id: driftHover }
                        Ui.Tooltip {
                            trigger: driftBadge
                            visible: driftHover.hovered
                            text: card.modelData.driftText
                        }
                    }
                    Ui.Text {
                        objectName: "musicTakeMeta"
                        visible: text !== ""
                        text: card.modelData.meta
                        role: Ui.Typography.MonoCaption
                        tone: Ui.Text.Secondary
                    }
                }
                Ui.EditorButton {
                    objectName: "musicTakeRecordToggle"
                    visible: card.modelData.record.length > 0
                    density: Ui.EditorButton.Compact
                    variant: Ui.EditorButton.Flat
                    contentAlignment: Qt.AlignLeft
                    iconName: card.recordOpen ? "expandMore" : "arrowRight"
                    text: qsTr("Generation record")
                    onClicked: root.toggleRecord(card.modelData.id)
                }
                Column {
                    objectName: "musicTakeRecord"
                    visible: card.recordOpen
                    width: parent.width
                    spacing: Ui.Metrics.micro
                    Repeater {
                        model: card.recordOpen ? card.modelData.record : []
                        delegate: Row {
                            id: field
                            required property var modelData
                            width: parent.width
                            spacing: Ui.Metrics.md
                            Ui.Text {
                                id: fieldName
                                width: Ui.Metrics.xxxl * 3
                                text: field.modelData.name
                                role: Ui.Typography.MonoCaption
                                tone: Ui.Text.Secondary
                            }
                            Ui.Text {
                                width: parent.width - fieldName.width - parent.spacing
                                text: field.modelData.value
                                wrapMode: Text.WrapAnywhere
                                role: Ui.Typography.MonoCaption
                            }
                        }
                    }
                }
            }
            Ui.ContextMenu {
                id: againMenu
                Ui.MenuItem {
                    objectName: "musicTakeSameSeed"
                    text: qsTr("Same seed")
                    onTriggered: root.jobs.regenerate(root.plan.takeClipId, card.modelData.id, true)
                }
                Ui.MenuItem {
                    objectName: "musicTakeNewSeed"
                    text: qsTr("New seed")
                    onTriggered: root.jobs.regenerate(root.plan.takeClipId, card.modelData.id, false)
                }
            }
        }
    }
}
