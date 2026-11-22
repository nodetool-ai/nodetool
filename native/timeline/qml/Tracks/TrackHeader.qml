// Mirrors web/src/components/timeline/Tracks/TrackHeader.tsx: the left strip
// of a track row. Top row: reorder grip, type glyph, name, index chip (V1,
// A1). Bottom row: the visibility, lock, sync-lock, mute, solo, effects,
// and delete buttons. An audio track with a music role shows the
// role as a chip before its name (docs/MUSIC-MODE.md MD4, UI-3). A color strip
// on the left edge shows the track color. An audio or midi track also shows an
// instrument icon and a volume slider with a level meter on a second row. The
// slider writes the mixer's `setTrackVolume` edit, once per drag, and hides when
// the header is too narrow.
import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../mixer/faderTaper.js" as Taper
import "../mixer/meterLevels.js" as Levels

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
    // The raw track (TrackListModel's `track` role).
    required property var track
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    signal deleteRequested()
    signal resizeStepRequested(real heightPx)
    readonly property alias resizeHandle: resizeHandle
    readonly property bool targeted: !TrackTargeting.untargetedTrackIds.includes(trackId)
    readonly property bool syncLocked: !TrackTargeting.syncLockOffTrackIds.includes(trackId)

    readonly property string patchKind: trackType === "video" || trackType === "overlay" ? "video" : trackType === "audio" ? "audio" : ""
    readonly property bool patched: patchKind === "video" ? SourceViewerState.patchedVideoTrackId === trackId
                                  : patchKind === "audio" && SourceViewerState.patchedAudioTrackId === trackId
    readonly property bool isSoundTrack: trackType === "audio" || trackType === "midi"
    readonly property bool automationShown: AutomationUIState.showAutomation && AutomationUIState.shownAutomationTrackIds.includes(trackId)
    readonly property color accent: TimelineVisuals.trackAccent(trackType)
    // The track's own color when the document has one, else the type accent.
    readonly property color stripColor: track && track.color ? track.color : accent
    readonly property real stripWidth: Ui.Metrics.xs
    // The volume row: below the top row, while the header has the width and
    // the height for it.
    readonly property real volumeMinWidth: Ui.Metrics.xxxl * 3
    readonly property real volumeRowY: topRow.y + topRow.height
    readonly property real volumeRowHeight: Ui.Metrics.small
    readonly property bool volumeShown: isSoundTrack && volumeSlider.width >= volumeMinWidth
                                        && height >= volumeRowY + volumeRowHeight + Ui.Metrics.sm

    objectName: "trackHeader-" + trackId
    height: rowHeight
    color: Ui.Theme.surfaceCanvas
    border.width: activeFocus ? Ui.Metrics.focus : 0
    border.color: Ui.Theme.borderFocus
    clip: true

    // The track color strip along the left edge.
    Rectangle {
        objectName: "trackColorStrip-" + header.trackId
        width: header.stripWidth
        height: parent.height
        color: header.stripColor
    }

    HoverHandler { id: headerHover }
    AutomationController { id: automation; timeline: header.timeline; trackId: header.trackId }

    // One compact row, as a conventional NLE track header: grip, source
    // patch, lock, track target, sync lock, visibility, mute, solo, the name,
    // then effects and delete. The row stays at the top of a
    // tall track.
    Row {
        id: topRow
        x: header.stripWidth + Ui.Metrics.xs
        y: Math.max(0, Math.min(Ui.Metrics.xs, (header.height - height) / 2))
        height: Ui.Metrics.compact
        spacing: Ui.Metrics.micro

        // The reorder grip.
        Ui.Icon {
            id: grip
            objectName: "trackGrip-" + header.trackId
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
        // Source patching: Insert and Overwrite place that stream of the Source
        // monitor's clip on this track. View state, not saved in the document.
        // The slot keeps its width on other tracks, so the columns line up.
        Item {
            width: Ui.Metrics.compact
            height: parent.height
            Rectangle {
                anchors.fill: patchChip
                visible: patchChip.visible
                radius: Ui.Metrics.radiusControl
                color: header.patched ? TimelineVisuals.targetFill : "transparent"
                border.width: Ui.Metrics.border
                border.color: header.patched ? TimelineVisuals.editBlue : Ui.Theme.borderSubtle
            }
            Ui.EditorButton {
                id: patchChip
                objectName: "sourcePatch-" + header.trackId
                visible: header.patchKind !== ""
                anchors.fill: parent
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                checkable: true
                active: header.patched
                Binding { target: patchChip; property: "checked"; value: header.patched }
                text: header.patchKind === "video" ? "V" : "A"
                textRole: Ui.Typography.MonoCaption
                textTone: header.patched ? Ui.Text.Primary : Ui.Text.Disabled
                accessibleName: (header.patched ? "Unpatch source " : "Patch source ") + (header.patchKind === "video" ? "video" : "audio") + " to " + header.name
                description: "Insert and Overwrite place Source " + (header.patchKind === "video" ? "video" : "audio") + " on this track"
                onClicked: SourceViewerState.togglePatch(header.patchKind, header.trackId)
            }
        }
        TrackIconButton {
            objectName: "track-locked-" + header.trackId
            anchors.verticalCenter: parent.verticalCenter
            iconKey: header.locked ? "lock" : "lockOpen"
            accessibleName: header.locked ? "Unlock track" : "Lock track"
            tone: header.locked ? "warning" : "idle"
            onClicked: if (header.timeline) { header.timeline.applyEdit("setTrackLocked", {trackId: header.trackId, locked: !header.locked}) }
        }
        // The index box doubles as the track-target toggle; a track is
        // targeted unless the person turned it off.
        Item {
            width: chip.implicitWidth
            height: parent.height
            Rectangle {
                anchors.fill: chip
                radius: Ui.Metrics.radiusControl
                color: header.targeted ? TimelineVisuals.targetFill : "transparent"
                border.width: Ui.Metrics.border
                border.color: header.targeted ? TimelineVisuals.editBlue : Ui.Theme.borderSubtle
            }
            Ui.EditorButton {
                id: chip
                objectName: "trackTarget-" + header.trackId
                opacity: header.targeted ? 1 : 0.55
                height: parent.height
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
        TrackIconButton {
            objectName: "trackSync-" + header.trackId
            anchors.verticalCenter: parent.verticalCenter
            // The slot keeps its width, so the columns line up across tracks.
            opacity: header.trackType !== "chord" ? 1 : 0
            enabled: header.trackType !== "chord"
            Accessible.ignored: !(header.trackType !== "chord")
            iconKey: header.syncLocked ? "sync" : "syncDisabled"
            accessibleName: header.syncLocked ? "Unlock track sync" : "Lock track sync"
            tone: header.syncLocked ? "idle" : "warning"
            onClicked: TrackTargeting.setTrackSyncLocked(header.trackId, !header.syncLocked)
        }
        TrackIconButton {
            objectName: "track-visible-" + header.trackId
            anchors.verticalCenter: parent.verticalCenter
            // The slot keeps its width, so the columns line up across tracks.
            opacity: header.trackType !== "midi" ? 1 : 0
            enabled: header.trackType !== "midi"
            Accessible.ignored: !(header.trackType !== "midi")
            iconKey: header.trackVisible ? "visibility" : "visibilityOff"
            accessibleName: header.trackVisible ? "Hide track" : "Show track"
            tone: header.trackVisible ? "idle" : "warning"
            onClicked: if (header.timeline) { header.timeline.applyEdit("setTrackVisible", {trackId: header.trackId, visible: !header.trackVisible}) }
        }
        TrackIconButton {
            objectName: "track-muted-" + header.trackId
            anchors.verticalCenter: parent.verticalCenter
            // The slot keeps its width, so the columns line up across tracks.
            opacity: header.isSoundTrack ? 1 : 0
            enabled: header.isSoundTrack
            Accessible.ignored: !(header.isSoundTrack)
            label: "M"
            accessibleName: header.muted ? "Unmute track" : "Mute track"
            tone: header.muted ? "success" : "idle"
            onClicked: if (header.timeline) { header.timeline.applyEdit("setTrackMuted", {trackId: header.trackId, muted: !header.muted}) }
        }
        TrackIconButton {
            objectName: "track-solo-" + header.trackId
            anchors.verticalCenter: parent.verticalCenter
            // The slot keeps its width, so the columns line up across tracks.
            opacity: header.isSoundTrack ? 1 : 0
            enabled: header.isSoundTrack
            Accessible.ignored: !(header.isSoundTrack)
            label: "S"
            accessibleName: header.solo ? "Unsolo track" : "Solo track"
            tone: header.solo ? "success" : "idle"
            onClicked: if (header.timeline) { header.timeline.applyEdit("setTrackSolo", {trackId: header.trackId, solo: !header.solo}) }
        }
        Item { width: Ui.Metrics.xs; height: 1 }
        Rectangle {
            id: roleChip
            objectName: "trackRole-" + header.trackId
            readonly property string musicRole: header.track && header.track.musicRole ? header.track.musicRole : ""
            readonly property string label: musicRole !== "" ? MusicProjectRules.roleLabel(musicRole) : ""
            visible: label !== "" && header.trackType === "audio"
            anchors.verticalCenter: parent.verticalCenter
            width: roleText.implicitWidth + 2 * Ui.Metrics.sm
            height: Ui.Metrics.iconMd
            radius: Ui.Metrics.radiusPill
            color: Ui.Theme.actionSelected
            border.width: Ui.Metrics.border
            border.color: Ui.Theme.borderSubtle
            Accessible.role: Accessible.StaticText
            Accessible.name: "Role: " + label
            Ui.Text {
                id: roleText
                anchors.centerIn: parent
                text: roleChip.label
                role: Ui.Typography.SansCaption
            }
        }
        Item { visible: roleChip.visible; width: Ui.Metrics.xs; height: 1 }
        Ui.Text {
            id: nameText
            objectName: "trackName-" + header.trackId
            anchors.verticalCenter: parent.verticalCenter
            width: Math.max(0, header.width - topRow.x - Ui.Metrics.sm - x)
            text: header.name
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            elide: Text.ElideRight
            HoverHandler { id: nameHover }
            Ui.Tooltip {
                objectName: "trackNameTooltip"
                trigger: nameText
                visible: nameText.truncated && (nameHover.hovered || header.activeFocus)
                text: header.name
            }
        }
    }

    // The instrument icon, the volume slider and its level meter. The slider
    // shares the mixer's gain (`channel.volumeDb`), its dB taper and its
    // `setTrackVolume` edit. A drag previews a draft and commits once on
    // release, so it is one undo step. A double-click resets to 0 dB.
    Ui.Icon {
        id: instrumentIcon
        objectName: "trackInstrumentIcon-" + header.trackId
        visible: header.isSoundTrack
        x: topRow.x
        y: header.volumeRowY + (header.volumeRowHeight - height) / 2
        name: header.trackType === "midi" ? "piano" : "graphicEq"
        size: Ui.Metrics.iconSm
        domainColor: header.stripColor
    }
    Item {
        id: volumeSlider
        objectName: "trackVolume-" + header.trackId
        readonly property real channelDb: automation.channel.volumeDb || 0
        property real draftDb: channelDb
        readonly property real displayDb: slider.editing ? draftDb : channelDb
        property var levels: [0, 0]
        x: instrumentIcon.x + instrumentIcon.width + Ui.Metrics.sm
        y: header.volumeRowY
        width: Math.max(0, header.width - x - Ui.Metrics.sm)
        height: header.volumeRowHeight
        visible: header.volumeShown
        Ui.Slider {
            id: slider
            objectName: "trackVolumeSlider-" + header.trackId
            width: parent.width
            height: Ui.Metrics.iconMd
            from: 0
            to: 1
            origin: 0
            resetValue: Taper.dbToFaderPosition(0)
            resetOnDoubleTap: true
            value: Taper.dbToFaderPosition(volumeSlider.channelDb)
            accessibleName: header.name + " volume"
            enabled: header.timeline !== null
            onValuePreviewed: position => volumeSlider.draftDb = Taper.faderPositionToDb(position)
            onValueCommitted: position => {
                const db = Taper.faderPositionToDb(position)
                if (db !== volumeSlider.channelDb) { automation.edit("setTrackVolume", {db: db}) }
            }
            onEditCanceled: volumeSlider.draftDb = volumeSlider.channelDb
        }
        Ui.Text {
            id: volumeReadout
            objectName: "trackVolumeReadout-" + header.trackId
            visible: slider.editing
            anchors.right: parent.right
            anchors.bottom: slider.top
            text: Taper.formatDb(volumeSlider.displayDb)
            role: Ui.Typography.MonoCaption
            tone: Ui.Text.Secondary
        }
        // The level meter under the slider track: left and right peaks, the
        // mixer's meter source and taper.
        Column {
            id: meter
            objectName: "trackMeter-" + header.trackId
            y: slider.height + Ui.Metrics.micro
            width: parent.width
            spacing: Ui.Metrics.border
            Repeater {
                model: 2
                delegate: Rectangle {
                    id: bar
                    required property int index
                    readonly property real level: Taper.dbToFaderPosition(Levels.db(volumeSlider.levels[index] || 0))
                    width: parent.width
                    height: Ui.Metrics.micro
                    color: Ui.Theme.borderSubtle
                    Rectangle {
                        width: parent.width * Math.max(0, Math.min(1, bar.level))
                        height: parent.height
                        color: bar.level >= 1 ? Ui.Theme.statusError : bar.level >= 0.86 ? Ui.Theme.statusWarning : Ui.Theme.statusSuccess
                    }
                }
            }
        }
        Timer {
            interval: 33
            running: header.volumeShown && header.visible
            repeat: true
            onTriggered: {
                const next = AutomationMeters.take(header.trackId)
                const held = volumeSlider.levels
                volumeSlider.levels = [Math.max(next[0], (held[0] || 0) * 0.85), Math.max(next[1], (held[1] || 0) * 0.85)]
            }
        }
    }

    // Effects and delete show while the pointer is on the
    // header, or while a lane is open, so the name keeps the space. They
    // sit over the end of the name on the header colour.
    Rectangle {
        anchors.fill: trailing
        anchors.leftMargin: -Ui.Metrics.sm
        opacity: trailing.opacity
        color: header.color
    }
    Row {
        id: trailing
        readonly property bool shown: headerHover.hovered || header.activeFocus || header.automationShown
        anchors.right: parent.right
        anchors.rightMargin: Ui.Metrics.xs
        y: topRow.y
        height: topRow.height
        opacity: shown ? 1 : 0
        spacing: Ui.Metrics.micro
        TrackEffectsButton {
            visible: header.isSoundTrack || header.trackType === "video"
            trackId: header.trackId
            timeline: header.timeline
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
            const next = Math.max(24, Math.min(300, authored + (event.key === Qt.Key_Down ? step : -step)))
            event.accepted = true
            header.resizeStepRequested(next)
        }
    }
}
