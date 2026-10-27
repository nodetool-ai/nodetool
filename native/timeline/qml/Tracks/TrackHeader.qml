// Mirrors web/src/components/timeline/Tracks/TrackHeader.tsx: the left strip
// of a track row. Top row: reorder grip, type glyph, name, index chip (V1,
// A1). Bottom row: the visibility, lock, sync-lock, mute, solo, effects,
// automation and delete buttons.
import QtQuick
import NodeTool.Timeline

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
    readonly property color accent: Theme.trackAccent(trackType)

    objectName: "trackHeader-" + trackId
    height: rowHeight
    color: Theme.backgroundDefault
    clip: true

    // padding: SPACING.xs SPACING.md; flex column, space-between.
    Item {
        id: topRow
        x: Theme.spacingMd
        y: Theme.spacingXs
        width: header.width - 2 * Theme.spacingMd
        height: 26

        // The reorder grip: 16 px wide, pulled 6 px left and 2 px right.
        Icon {
            id: grip
            objectName: "trackGrip-" + header.trackId
            x: -Theme.spacingSm
            anchors.verticalCenter: parent.verticalCenter
            path: Icons.dragIndicator
            size: 16
            color: gripHover.hovered ? Theme.textSecondary : Theme.textDisabled
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
            x: grip.x + 16 - Theme.spacingMicro + Theme.spacingMd
            width: 26
            height: 26
            radius: Theme.radiusMd
            color: Theme.backgroundPaper
            Icon {
                anchors.centerIn: parent
                path: Theme.trackIcon(header.trackType)
                size: 15
                color: header.accent
            }
        }
        Text {
            id: nameText
            x: glyph.x + glyph.width + Theme.spacingMd
            anchors.verticalCenter: parent.verticalCenter
            // The web name is an <input> at the browser's default size of 20
            // characters: 151 px at 13 px Inter in Chromium, measured. The
            // chip sits after that box, not after the text.
            width: Math.max(0, Math.min(151, topRow.width - x - chip.width - Theme.spacingSm))
            text: header.name
            color: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            font.weight: Font.Medium
            font.letterSpacing: -0.005 * Theme.fontSizeSmall
            elide: Text.ElideRight
        }
        // The index chip doubles as the track-target toggle; a track is
        // targeted unless the person turned it off.
        Rectangle {
            id: chip
            objectName: "trackTarget-" + header.trackId
            opacity: header.targeted ? 1 : 0.55
            x: nameText.x + nameText.width + Theme.spacingSm
            anchors.verticalCenter: parent.verticalCenter
            height: 18
            width: chipText.implicitWidth + 2 * Theme.spacingSm + 2
            radius: Theme.radiusSm
            color: chipHover.hovered ? Theme.actionHover : header.targeted ? Theme.actionSelected : "transparent"
            border.width: 1
            border.color: header.targeted ? Theme.primary : Theme.divider
            Text {
                id: chipText
                anchors.centerIn: parent
                text: Theme.trackPrefix(header.trackType) + header.typedIndex
                color: header.targeted ? Theme.primary : Theme.textDisabled
                font.family: Theme.monoFamily
                font.pixelSize: Theme.fontSizeSmaller
                font.weight: Font.DemiBold
                font.letterSpacing: 0.04 * Theme.fontSizeSmaller
            }
            HoverHandler { id: chipHover; cursorShape: Qt.PointingHandCursor }
            TapHandler { onTapped: TrackTargeting.setTrackTargeted(header.trackId, !header.targeted) }
        }
    }

    // Controls row: gap SPACING.micro, pulled SPACING.xs left to align the
    // glyph edges.
    Row {
        id: controls
        x: Theme.spacingMd - Theme.spacingXs
        y: header.height - Theme.spacingXs - 1 - height
        spacing: Theme.spacingMicro

        TrackIconButton {
            objectName: "track-visible-" + header.trackId
            visible: header.trackType !== "midi"
            icon: header.trackVisible ? Icons.visibility : Icons.visibilityOff
            tone: header.trackVisible ? "idle" : "warning"
            onClicked: if (header.timeline) { header.timeline.applyEdit("setTrackVisible", {trackId: header.trackId, visible: !header.trackVisible}) }
        }
        TrackIconButton {
            objectName: "track-locked-" + header.trackId
            icon: header.locked ? Icons.lock : Icons.lockOpen
            tone: header.locked ? "warning" : "idle"
            onClicked: if (header.timeline) { header.timeline.applyEdit("setTrackLocked", {trackId: header.trackId, locked: !header.locked}) }
        }
        TrackIconButton {
            objectName: "trackSync-" + header.trackId
            visible: header.trackType !== "chord"
            icon: header.syncLocked ? Icons.sync : Icons.syncDisabled
            tone: header.syncLocked ? "idle" : "warning"
            onClicked: TrackTargeting.setTrackSyncLocked(header.trackId, !header.syncLocked)
        }
        TrackIconButton {
            objectName: "track-muted-" + header.trackId
            visible: header.isSoundTrack
            icon: header.muted ? Icons.volumeOffOutlined : Icons.volumeUpOutlined
            tone: header.muted ? "warning" : "idle"
            onClicked: if (header.timeline) { header.timeline.applyEdit("setTrackMuted", {trackId: header.trackId, muted: !header.muted}) }
        }
        TrackIconButton {
            objectName: "track-solo-" + header.trackId
            visible: header.isSoundTrack
            label: "S"
            tone: header.solo ? "success" : "idle"
            onClicked: if (header.timeline) { header.timeline.applyEdit("setTrackSolo", {trackId: header.trackId, solo: !header.solo}) }
        }
        TrackEffectsButton {
            visible: header.isSoundTrack || header.trackType === "video"
            trackId: header.trackId
            timeline: header.timeline
        }
        TrackIconButton {
            visible: header.isSoundTrack || header.trackType === "video" || header.trackType === "overlay"
            icon: Icons.showChart
            tone: "dim"
        }
        TrackIconButton {
            objectName: "track-delete-" + header.trackId
            icon: Icons.deleteOutline
            tone: "idle"
            onClicked: header.deleteRequested()
        }
    }

    // borderBottom: 1px divider.
    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Theme.divider
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
