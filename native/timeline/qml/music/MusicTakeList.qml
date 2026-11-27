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
    property MusicPanelModel plan: null
    property MusicJobs jobs: null
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
    onClipIdChanged: {
        openIds = []
        closeAgain()
    }
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

    ListView {
        objectName: "musicTakeViewport"
        onMovementStarted: root.closeAgain()
        width: root.width
        height: Math.min(contentHeight, Ui.Metrics.dialogCompactWidth)
        clip: true
        reuseItems: true
        cacheBuffer: Ui.Metrics.touch
        spacing: root.spacing
        model: root.plan && !root.plan.takeClipPending ? root.plan.takeRows : null
        delegate: Rectangle {
            id: card
            required property var take
            required property int index
            readonly property bool recordOpen: root.openIds.indexOf(take.id) >= 0
            objectName: "musicTake_" + index
            width: root.width
            height: content.height + 2 * Ui.Metrics.md
            radius: Ui.Metrics.radiusCard
            color: take.active ? Ui.Theme.actionSelected : Ui.Theme.surfacePanel
            border.width: take.active ? Ui.Metrics.focus : Ui.Metrics.border
            border.color: take.active ? Ui.Theme.borderFocus : Ui.Theme.borderSubtle

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
                        iconName: card.take.active ? "check" : ""
                        text: card.take.label
                        accessibleName: qsTr("Make %1 active").arg(card.take.label)
                        description: card.take.active ? qsTr("The clip plays this take.") : ""
                        onClicked: if (!card.take.active) root.plan.selectTake(card.take.id)
                    }
                    Row {
                        id: actions
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Ui.Metrics.xs
                        Ui.EditorButton {
                            id: again
                            objectName: "musicTakeRegenerate"
                            visible: card.take.canRegenerate
                            density: Ui.EditorButton.Compact
                            variant: Ui.EditorButton.Flat
                            iconName: "refresh"
                            accessibleName: qsTr("Run %1 again").arg(card.take.label)
                            description: qsTr("Run this take's request again")
                            enabled: !!root.jobs
                            onClicked: root.openAgain(again, card.take.id)
                        }
                        Ui.EditorButton {
                            objectName: "musicTakeDelete"
                            density: Ui.EditorButton.Compact
                            variant: Ui.EditorButton.Flat
                            iconName: "close"
                            accessibleName: qsTr("Delete %1").arg(card.take.label)
                            description: qsTr("Delete the take. Its audio stays in the library.")
                            enabled: card.take.canDelete
                            disabledReason: card.take.deleteReason
                            onClicked: root.plan.deleteTake(card.take.id)
                        }
                    }
                }
                Row {
                    spacing: Ui.Metrics.sm
                    Ui.Text {
                        objectName: "musicTakeTask"
                        visible: text !== ""
                        text: card.take.task
                        role: Ui.Typography.MonoCaption
                        tone: Ui.Text.Secondary
                    }
                    Rectangle {
                        id: driftBadge
                        objectName: "musicTakeDrifting"
                        visible: card.take.drifting
                        width: driftText.implicitWidth + 2 * Ui.Metrics.xs
                        height: driftText.implicitHeight
                        radius: Ui.Metrics.radiusControl
                        color: Ui.Theme.statusWarningSurface
                        Accessible.role: Accessible.StaticText
                        Accessible.name: card.take.driftText
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
                            text: card.take.driftText
                        }
                    }
                    Ui.Text {
                        objectName: "musicTakeMeta"
                        visible: text !== ""
                        text: card.take.meta
                        role: Ui.Typography.MonoCaption
                        tone: Ui.Text.Secondary
                    }
                }
                Ui.EditorButton {
                    objectName: "musicTakeRecordToggle"
                    visible: card.take.record.length > 0
                    density: Ui.EditorButton.Compact
                    variant: Ui.EditorButton.Flat
                    contentAlignment: Qt.AlignLeft
                    iconName: card.recordOpen ? "expandMore" : "arrowRight"
                    text: qsTr("Generation record")
                    onClicked: root.toggleRecord(card.take.id)
                }
                Column {
                    objectName: "musicTakeRecord"
                    visible: card.recordOpen
                    width: parent.width
                    spacing: Ui.Metrics.micro
                    Repeater {
                        model: card.recordOpen ? card.take.record : []
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

        }
    }
    property string menuTakeId: ""
    property string menuClipId: ""
    function closeAgain() {
        if (againMenuLoader.item) againMenuLoader.item.close()
        againMenuLoader.active = false
        menuTakeId = ""
        menuClipId = ""
    }
    function menuTargetValid() {
        return !!plan && plan.takeClipId === menuClipId
            && plan.takes.some(take => take.id === menuTakeId && take.canRegenerate)
    }
    Connections {
        target: root.plan
        function onTakesChanged() { if (!root.menuTargetValid()) root.closeAgain() }
    }
    function regenerate(sameSeed) {
        if (jobs && menuTargetValid()) jobs.regenerate(menuClipId, menuTakeId, sameSeed)
        closeAgain()
    }
    function openAgain(button, takeId) {
        if (!plan) return
        menuTakeId = takeId
        menuClipId = plan.takeClipId
        againMenuLoader.active = true
        againMenuLoader.item.openAt(button)
    }
    Loader {
        id: againMenuLoader
        width: 0
        height: 0
        active: false
        sourceComponent: Ui.ContextMenu {
            objectName: "musicTakeRegenerateMenu"
            Ui.MenuItem {
                objectName: "musicTakeSameSeed"
                text: qsTr("Same seed")
                onTriggered: root.regenerate(true)
            }
            Ui.MenuItem {
                objectName: "musicTakeNewSeed"
                text: qsTr("New seed")
                onTriggered: root.regenerate(false)
            }
        }
    }

}
