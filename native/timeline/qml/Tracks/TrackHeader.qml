// Mirrors web/src/components/timeline/Tracks/TrackHeader.tsx: the left strip
// of a track row. Top row: reorder grip, type glyph, name, index chip (V1,
// A1). Bottom row: the visibility, lock, sync-lock, mute, solo, effects,
// automation and delete buttons.
import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: header
    required property string trackId
    required property string name
    required property string trackType
    required property bool trackVisible
    required property bool locked
    required property bool muted
    required property bool solo
    required property int typedIndex
    required property double rowHeight
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    signal deleteRequested()
    signal resizeStepRequested(real heightPx)
    readonly property alias resizeHandle: resizeHandle
    readonly property bool targeted: !TrackTargeting.untargetedTrackIds.includes(trackId)
    readonly property bool syncLocked: !TrackTargeting.syncLockOffTrackIds.includes(trackId)

    readonly property bool isSoundTrack: trackType === "audio" || trackType === "midi"
    readonly property bool automationShown: AutomationUIState.shownAutomationTrackIds.includes(trackId)
    readonly property color accent: TimelineVisuals.trackAccent(trackType)

    objectName: "trackHeader-" + trackId
    height: rowHeight
    color: Ui.Theme.surfaceCanvas
    border.width: activeFocus ? Ui.Metrics.focus : 0
    border.color: Ui.Theme.borderFocus
    clip: true

    AutomationController { id: automation; timeline: header.timeline; trackId: header.trackId }

    // padding: SPACING.xs SPACING.md; flex column, space-between.
    Item {
        id: topRow
        x: Ui.Metrics.md
        y: Ui.Metrics.xs
        width: header.width - 2 * Ui.Metrics.md
        height: 26

        // The reorder grip: 16 px wide, pulled 6 px left and 2 px right.
        Ui.Icon {
            id: grip
            objectName: "trackGrip-" + header.trackId
            x: -Ui.Metrics.sm
            anchors.verticalCenter: parent.verticalCenter
            name: "dragIndicator"
            size: Ui.Metrics.iconSm
            tone: gripHover.hovered ? Ui.Text.Secondary : Ui.Text.Disabled
            HoverHandler { id: gripHover; cursorShape: Qt.OpenHandCursor }
            MouseArea {
                anchors.fill: parent
                onPressed: mouse => {
                    const p = mapToItem(null, mouse.x, mouse.y)
                    if (header.gestures) { header.gestures.pressTrack(header.trackId, "reorder", p.x, p.y) }
                }
            }
        }
        Rectangle {
            id: glyph
            x: grip.x + Ui.Metrics.iconSm - Ui.Metrics.micro + Ui.Metrics.md
            width: Ui.Metrics.compact
            height: Ui.Metrics.compact
            radius: Ui.Metrics.radiusControl
            color: Ui.Theme.surfacePanel
            Ui.Icon {
                anchors.centerIn: parent
                name: TimelineVisuals.trackIconName(header.trackType)
                size: Ui.Metrics.iconSm
                domainColor: header.accent
            }
        }
        Ui.Text {
            id: nameText
            x: glyph.x + glyph.width + Ui.Metrics.md
            anchors.verticalCenter: parent.verticalCenter
            width: Math.max(0, Math.min(Ui.Metrics.small * 6 + Ui.Metrics.sm, topRow.width - x - chip.width - Ui.Metrics.sm))
            text: header.name
            role: Ui.Typography.SansLabel
            elide: Text.ElideRight
        }
        // The index chip doubles as the track-target toggle; a track is
        // targeted unless the person turned it off.
        Ui.EditorButton {
            id: chip
            objectName: "trackTarget-" + header.trackId
            opacity: header.targeted ? 1 : 0.55
            x: nameText.x + nameText.width + Ui.Metrics.sm
            anchors.verticalCenter: parent.verticalCenter
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            checkable: true
            Binding { target: chip; property: "checked"; value: header.targeted }
            text: TimelineVisuals.trackPrefix(header.trackType) + header.typedIndex
            textRole: Ui.Typography.MonoCaption
            textTone: header.targeted ? Ui.Text.Primary : Ui.Text.Disabled
            accessibleName: (header.targeted ? "Untarget " : "Target ") + header.name + " track"
            description: "Choose whether this track receives insert and paste commands"
            onClicked: TrackTargeting.setTrackTargeted(header.trackId, !header.targeted)
        }
    }

    // Controls row: gap SPACING.micro, pulled SPACING.xs left to align the
    // glyph edges.
    Row {
        id: controls
        x: Ui.Metrics.md - Ui.Metrics.xs
        y: header.height - Ui.Metrics.xs - 1 - height
        spacing: Ui.Metrics.micro

        TrackIconButton {
            objectName: "track-visible-" + header.trackId
            visible: header.trackType !== "midi"
            iconKey: header.trackVisible ? "visibility" : "visibilityOff"
            accessibleName: header.trackVisible ? "Hide track" : "Show track"
            tone: header.trackVisible ? "idle" : "warning"
            onClicked: if (header.timeline) { header.timeline.applyEdit("setTrackVisible", {trackId: header.trackId, visible: !header.trackVisible}) }
        }
        TrackIconButton {
            objectName: "track-locked-" + header.trackId
            iconKey: header.locked ? "lock" : "lockOpen"
            accessibleName: header.locked ? "Unlock track" : "Lock track"
            tone: header.locked ? "warning" : "idle"
            onClicked: if (header.timeline) { header.timeline.applyEdit("setTrackLocked", {trackId: header.trackId, locked: !header.locked}) }
        }
        TrackIconButton {
            objectName: "trackSync-" + header.trackId
            visible: header.trackType !== "chord"
            iconKey: header.syncLocked ? "sync" : "syncDisabled"
            accessibleName: header.syncLocked ? "Unlock track sync" : "Lock track sync"
            tone: header.syncLocked ? "idle" : "warning"
            onClicked: TrackTargeting.setTrackSyncLocked(header.trackId, !header.syncLocked)
        }
        TrackIconButton {
            objectName: "track-muted-" + header.trackId
            visible: header.isSoundTrack
            iconKey: header.muted ? "volumeOffOutlined" : "volumeUpOutlined"
            accessibleName: header.muted ? "Unmute track" : "Mute track"
            tone: header.muted ? "warning" : "idle"
            onClicked: if (header.timeline) { header.timeline.applyEdit("setTrackMuted", {trackId: header.trackId, muted: !header.muted}) }
        }
        TrackIconButton {
            objectName: "track-solo-" + header.trackId
            visible: header.isSoundTrack
            label: "S"
            accessibleName: header.solo ? "Unsolo track" : "Solo track"
            tone: header.solo ? "success" : "idle"
            onClicked: if (header.timeline) { header.timeline.applyEdit("setTrackSolo", {trackId: header.trackId, solo: !header.solo}) }
        }
        TrackEffectsButton {
            visible: header.isSoundTrack || header.trackType === "video"
            trackId: header.trackId
            timeline: header.timeline
        }
        Loader {
            active: header.isSoundTrack || header.trackType === "video" || header.trackType === "overlay"
            visible: active
            sourceComponent: TrackIconButton {
                objectName: "track-automation-" + header.trackId
                iconKey: "showChart"
                tone: (automation.channel.automation || []).length > 0 || header.automationShown ? "idle" : "dim"
                readonly property string automationLabel: header.automationShown ? "Hide automation lanes" : "Show automation lanes"
                accessibleName: automationLabel
                Accessible.checkable: true
                Accessible.checked: header.automationShown
                onClicked: AutomationUIState.toggleTrackAutomation(header.trackId)
                description: automationLabel
            }
        }
        TrackIconButton {
            objectName: "track-delete-" + header.trackId
            iconKey: "deleteOutline"
            accessibleName: "Delete track"
            tone: "idle"
            onClicked: header.deleteRequested()
        }
    }

    // borderBottom: 1px divider.
    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Ui.Theme.borderSubtle
    }
    MouseArea {
        id: resizeHandle
        objectName: "trackResize-" + header.trackId
        anchors.bottom: parent.bottom
        width: parent.width
        height: 6
        cursorShape: Qt.SizeVerCursor
        onPressed: mouse => {
            forceActiveFocus()
            const p = mapToItem(null, mouse.x, mouse.y)
            if (header.gestures) { header.gestures.pressTrack(header.trackId, "resize", p.x, p.y) }
        }
        Keys.onPressed: event => {
            if (event.key !== Qt.Key_Up && event.key !== Qt.Key_Down) { return }
            const step = event.modifiers & Qt.ShiftModifier ? 32 : 8
            const authored = header.rowHeight / (header.viewState ? header.viewState.verticalZoom : 1)
            const next = Math.max(48, Math.min(300, authored + (event.key === Qt.Key_Down ? step : -step)))
            event.accepted = true
            header.resizeStepRequested(next)
        }
    }
}
