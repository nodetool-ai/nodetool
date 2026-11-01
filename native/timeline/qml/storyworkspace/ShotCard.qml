import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import "shotDraft.js" as Draft

// One cell of the storyboard grid: the clip or current still, the status, the hover actions, and
// the caption with the shot's action. A port of web ShotCard, ShotActions and ShotHoverToolbar.
Rectangle {
    id: card
    required property var shot
    required property var boardDocument
    property string caption: ""
    property var mediaBrowser: null
    property var timeline: null
    property bool selected: false
    property bool stillsOnly: false
    property bool readOnly: false
    property bool draggable: false
    property bool dropTarget: false
    property real ratio: 16 / 9
    property bool playing: false
    signal selectRequested()
    signal editRequested()
    signal renderRequested(string kind)
    signal duplicateRequested()
    signal nudgeRequested(int direction)
    signal deleteRequested()
    signal fullscreenRequested(string kind, var take)
    signal dragStarted()
    signal dragMoved(point scenePoint)
    signal dragEnded()

    objectName: "shotCard_" + shot.id
    readonly property bool generating: Draft.isGenerating(shot)
    readonly property bool stillRendering: shot.status === "keyframe_generating"
    readonly property var previewClip: stillsOnly ? null : shot.clip || null
    readonly property bool hasKeyframe: !!shot.keyframe && !!(shot.keyframe.uri || shot.keyframe.asset_id)
    readonly property var previewMedia: previewClip || shot.keyframe || null
    readonly property bool failed: shot.status === "failed"
    readonly property bool clipNeedsStill: (shot.render_mode || "keyframe") === "keyframe" && !shot.keyframe
    readonly property var placeInScene: {
        const groups = Draft.sceneOrder(boardDocument.shots || [])
        for (const group of groups) {
            const at = group.shots.findIndex(row => row.id === shot.id)
            if (at >= 0) return {first: at === 0, last: at === group.shots.length - 1}
        }
        return {first: true, last: true}
    }
    readonly property string pill: {
        if (generating) return shot.status === "clip_generating" ? "rendering clip" : "rendering still"
        if (failed) return "failed"
        if (shot.clip) return ""
        if (shot.covered_by) return "covered"
        if (shot.keyframe) return "still"
        return "planned"
    }

    function assetId(ref) { return ref ? ref.asset_id || ((ref.uri || "").startsWith("asset://") ? ref.uri.slice(8) : "") : "" }
    function thumbnail(ref) {
        const id = assetId(ref)
        if (!id || !mediaBrowser) return ""
        mediaBrowser.requestThumbnail(id)
        return mediaBrowser.thumbnails[id] || ""
    }
    function formatDuration(seconds) {
        const total = Math.max(0, seconds)
        const minutes = Math.floor(total / 60)
        const rest = total - minutes * 60
        return minutes + ":" + (rest < 10 ? "0" : "") + rest.toFixed(rest % 1 === 0 ? 0 : 1)
    }

    implicitHeight: body.implicitHeight
    radius: Ui.Metrics.radiusCard
    color: Ui.Theme.surfacePanel
    border.width: dropTarget ? Ui.Metrics.focus : Ui.Metrics.border
    border.color: dropTarget || selected ? Ui.Theme.accentPrimary : generating ? Ui.Theme.statusInfo : Ui.Theme.borderSubtle
    clip: true
    activeFocusOnTab: true
    Accessible.role: Accessible.Button
    Accessible.name: (shot.index + 1) + ". " + (shot.slug || "Untitled shot")
    Accessible.checked: selected
    Keys.onSpacePressed: selectRequested()
    Keys.onReturnPressed: if (!readOnly) editRequested()

    HoverHandler { id: hover }
    TapHandler {
        onTapped: card.selectRequested()
        onDoubleTapped: if (card.previewMedia) card.fullscreenRequested(card.previewClip ? "video" : "image", card.previewMedia)
    }

    ColumnLayout {
        id: body
        width: parent.width
        spacing: Ui.Metrics.none

        Item {
            id: media
            Layout.fillWidth: true
            Layout.preferredHeight: width / card.ratio
            Rectangle { anchors.fill: parent; color: Ui.Theme.actionHover }
            Image {
                id: still
                objectName: "shotCardImage_" + card.shot.id
                anchors.fill: parent
                source: card.previewClip ? card.thumbnail(card.previewClip) || card.thumbnail(card.shot.keyframe) : card.hasKeyframe ? card.thumbnail(card.shot.keyframe) : ""
                visible: !card.playing && status === Image.Ready
                fillMode: Image.PreserveAspectCrop
                asynchronous: true
                sourceSize: Qt.size(card.width * 2, card.width * 2 / card.ratio)
            }
            Ui.Text {
                anchors.centerIn: parent
                width: parent.width - 2 * Ui.Metrics.md
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.Wrap
                visible: !card.previewClip && (!card.hasKeyframe || still.status === Image.Error)
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Disabled
                text: card.stillRendering ? "Rendering still…" : "No still yet"
            }
            Loader {
                anchors.fill: parent
                active: card.playing && !!card.previewClip
                source: "ShotClipPlayer.qml"
                onLoaded: {
                    item.timeline = Qt.binding(() => card.timeline)
                    item.durationMs = Qt.binding(() => { const seconds = Number(card.previewClip ? card.previewClip.duration : 0); return isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0 })
                    item.assetId = Qt.binding(() => card.assetId(card.previewClip))
                    item.togglePlay()
                }
            }
            Ui.ToolbarIconButton {
                objectName: "shotCardPlay_" + card.shot.id
                anchors.centerIn: parent
                visible: !!card.previewClip && !card.playing && !card.generating
                iconName: "playArrow"
                text: card.shot.slug ? card.shot.slug + " clip" : "Play clip"
                onClicked: card.playing = true
            }
            Rectangle {
                anchors.fill: parent
                visible: card.generating
                color: Ui.Theme.scrimMedia
                Ui.BusyIndicator { anchors.centerIn: parent; running: parent.visible }
            }

            // The shot's actions on the media's top left, shown on hover or focus.
            Rectangle {
                objectName: "shotCardActions_" + card.shot.id
                x: Ui.Metrics.sm
                y: Ui.Metrics.sm
                width: actions.implicitWidth + 2 * Ui.Metrics.micro
                height: actions.implicitHeight + 2 * Ui.Metrics.micro
                radius: Ui.Metrics.radiusControl
                color: Ui.Theme.surfaceOverlay
                visible: hover.hovered || card.activeFocus || card.menu.opened
                Row {
                    id: actions
                    anchors.centerIn: parent
                    spacing: Ui.Metrics.micro
                    Ui.Icon {
                        visible: card.draggable
                        anchors.verticalCenter: parent.verticalCenter
                        name: "dragIndicator"
                        size: Ui.Metrics.iconSm
                        tone: Ui.Text.Secondary
                        Accessible.name: "Drag to reorder"
                        DragHandler {
                            id: drag
                            target: null
                            onActiveChanged: active ? card.dragStarted() : card.dragEnded()
                        onCentroidChanged: if (active) card.dragMoved(parent.mapToItem(null, centroid.position.x, centroid.position.y))
                            cursorShape: Qt.ClosedHandCursor
                        }
                    }
                    Ui.ToolbarIconButton {
                        objectName: "shotCardEdit_" + card.shot.id
                        visible: !card.readOnly
                        iconName: "rename"
                        text: "Edit shot"
                        onClicked: card.editRequested()
                    }
                    Ui.ToolbarIconButton {
                        visible: !card.readOnly
                        iconName: "refresh"
                        text: "Regenerate still"
                        description: "Render a new still and pick its model"
                        enabled: !card.generating
                        onClicked: card.renderRequested("image")
                    }
                    Ui.ToolbarIconButton {
                        visible: !card.readOnly
                        iconName: "movieOutlined"
                        text: "Render clip"
                        description: card.clipNeedsStill ? "Render a still first" : "Render a clip and pick its model"
                        enabled: !card.generating && !card.clipNeedsStill
                        onClicked: card.renderRequested("video")
                    }
                    Ui.ToolbarIconButton {
                        visible: !!card.previewMedia && !card.generating
                        iconName: "fullscreen"
                        text: card.previewClip ? "View clip fullscreen" : "View still fullscreen"
                        description: "View fullscreen (double-click)"
                        onClicked: card.fullscreenRequested(card.previewClip ? "video" : "image", card.previewMedia)
                    }
                    Ui.ToolbarIconButton {
                        id: menuButton
                        objectName: "shotCardMenu_" + card.shot.id
                        iconName: "moreVert"
                        text: "Shot actions"
                        onClicked: card.menu.openAt(menuButton)
                    }
                }
            }

            Rectangle {
                objectName: "shotStatusPill_" + card.shot.id
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                anchors.margins: Ui.Metrics.md
                visible: card.pill !== "" && !card.playing
                width: pillText.implicitWidth + 2 * Ui.Metrics.sm
                height: pillText.implicitHeight + Ui.Metrics.xs
                radius: Ui.Metrics.radiusPill
                color: card.pill === "failed" ? Ui.Theme.statusErrorSurface : Ui.Theme.surfaceOverlay
                Ui.Text {
                    id: pillText
                    anchors.centerIn: parent
                    text: card.pill
                    role: Ui.Typography.SansCaption
                    tone: card.pill === "failed" ? Ui.Text.Error : card.generating ? Ui.Text.Info : Ui.Text.Secondary
                }
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            Layout.margins: Ui.Metrics.lg
            spacing: Ui.Metrics.xs
            RowLayout {
                Layout.fillWidth: true
                spacing: Ui.Metrics.sm
                Ui.Text { text: card.caption || "Shot " + (card.shot.index + 1); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                Ui.Text {
                    objectName: "shotCardDuration_" + card.shot.id
                    visible: (card.shot.duration_seconds || 0) > 0
                    text: card.formatDuration(card.shot.duration_seconds || 0)
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    Accessible.name: (card.shot.duration_seconds || 0) + ((card.shot.duration_seconds || 0) === 1 ? " second" : " seconds")
                }
                Item { Layout.fillWidth: true }
            }
            Ui.Text {
                Layout.fillWidth: true
                Layout.minimumHeight: Ui.Typography.pixelSize(Ui.Typography.SansLabel) * 2.7
                text: (card.shot.action || "").trim() || "No action described"
                role: Ui.Typography.SansLabel
                wrapMode: Text.Wrap
                maximumLineCount: 2
                elide: Text.ElideRight
            }
        }

        Rectangle {
            objectName: "shotRenderError_" + card.shot.id
            Layout.fillWidth: true
            Layout.margins: Ui.Metrics.lg
            Layout.topMargin: Ui.Metrics.none
            visible: card.failed
            implicitHeight: errorRow.implicitHeight + 2 * Ui.Metrics.sm
            radius: Ui.Metrics.radiusControl
            color: Ui.Theme.statusErrorSurface
            RowLayout {
                id: errorRow
                anchors.fill: parent
                anchors.margins: Ui.Metrics.sm
                Ui.Text { Layout.fillWidth: true; wrapMode: Text.Wrap; text: "The render failed. Try again."; role: Ui.Typography.SansCaption; tone: Ui.Text.Error }
                Ui.EditorButton {
                    visible: !card.readOnly
                    density: Ui.EditorButton.Compact
                    text: "Retry"
                    onClicked: card.renderRequested(card.shot.keyframe ? "video" : "image")
                }
            }
        }
    }

    // Kept out of the layout: a popup child adds space to a layout.
    property Ui.ContextMenu menu: Ui.ContextMenu {
        objectName: "shotCardActionsMenu"
        Ui.MenuItem { text: "Render still…"; visible: !card.readOnly; enabled: !card.generating; onTriggered: card.renderRequested("image") }
        Ui.MenuItem { text: "Render clip…"; visible: !card.readOnly; enabled: !card.generating && !card.clipNeedsStill; onTriggered: card.renderRequested("video") }
        Ui.MenuItem { objectName: "shotCardDuplicate"; text: "Duplicate shot"; visible: !card.readOnly; onTriggered: card.duplicateRequested() }
        Ui.MenuItem { text: "Move earlier"; visible: !card.readOnly && !(card.placeInScene.first && card.placeInScene.last); enabled: !card.placeInScene.first; onTriggered: card.nudgeRequested(-1) }
        Ui.MenuItem { text: "Move later"; visible: !card.readOnly && !(card.placeInScene.first && card.placeInScene.last); enabled: !card.placeInScene.last; onTriggered: card.nudgeRequested(1) }
        Ui.MenuItem { objectName: "shotCardDelete"; text: "Delete shot"; visible: !card.readOnly; textTone: Ui.Text.Error; onTriggered: card.deleteRequested() }
    }
}
