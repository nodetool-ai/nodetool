import QtQuick
import QtQuick.Window
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.Media
import "shotDraft.js" as Draft

// Full-screen pass over the board's stills or clips, in scene and shot order. Swipe with two
// fingers, drag, or use the arrow keys to move between shots. Space plays a clip.
// A port of web ShotMediaViewer.
Ui.Dialog {
    id: viewer
    // The pages decode at the stage size in 256 px steps, so a window resize
    // decodes again only at a step, and all pages share one cache entry.
    readonly property size stageDecodeSize: Qt.size(Math.ceil(stage.width * Screen.devicePixelRatio / 256) * 256,
        Math.ceil(stage.height * Screen.devicePixelRatio / 256) * 256)
    objectName: "shotMediaViewer"
    property var shots: []
    property var mediaBrowser: null
    property Component clipPlayer: null
    function assetId(ref) { return ref ? ref.asset_id || ((ref.uri || "").startsWith("asset://") ? ref.uri.slice(8) : "") : "" }
    property string kind: "image"
    property int position: -1
    readonly property var items: {
        const list = []
        const groups = Draft.sceneOrder(viewer.shots)
        for (let g = 0; g < groups.length; ++g) {
            for (let s = 0; s < groups[g].shots.length; ++s) {
                const shot = groups[g].shots[s]
                const takes = Draft.versions(shot, kind === "video" ? "clip" : "still")
                for (let i = 0; i < takes.length; ++i) {
                    list.push({shot: shot, take: takes[i], number: i + 1, scene: g + 1, shotInScene: s + 1, firstInScene: list.length === 0 || list[list.length - 1].scene !== g + 1})
                }
            }
        }
        return list
    }
    readonly property var item: position >= 0 && position < items.length ? items[position] : null
    function openTake(nextKind, take) {
        kind = nextKind
        show(Math.max(0, items.findIndex(entry => Draft.sameMedia(entry.take, take))))
        open()
    }
    function show(next) {
        if (next < 0 || next >= items.length) return
        position = next
        // The current shot and its neighbours load first, so a swipe shows them at once.
        for (const at of [next, next - 1, next + 1]) {
            if (at >= 0 && at < items.length && mediaBrowser) mediaBrowser.requestThumbnail(assetId(items[at].take))
        }
    }
    function step(delta) { stage.step(delta) }
    function picture(entry, full) {
        const key = entry ? assetId(entry.take) : ""
        if (!key || !mediaBrowser) return ""
        return (full && kind === "image" ? mediaBrowser.originals[key] : "") || mediaBrowser.thumbnails[key] || ""
    }
    function label(entry) {
        return entry ? "Scene " + entry.scene + " · Shot " + entry.shotInScene + " · " + (kind === "video" ? "Clip " : "Still ") + entry.number : ""
    }

    x: 0
    y: 0
    width: parent ? parent.width : 0
    height: parent ? parent.height : 0
    title: label(item)
    onClosed: position = -1
    // Opens with a fade and a small zoom toward the viewer. Reduced motion makes both immediate.
    enter: Transition {
        NumberAnimation { property: "opacity"; from: 0; to: 1; duration: Ui.Theme.reducedMotion ? 0 : Ui.Metrics.motionNormal; easing.type: Easing.OutCubic }
        NumberAnimation { property: "scale"; from: 0.96; to: 1; duration: Ui.Theme.reducedMotion ? 0 : Ui.Metrics.motionNormal; easing.type: Easing.OutCubic }
    }
    exit: Transition {
        NumberAnimation { property: "opacity"; from: 1; to: 0; duration: Ui.Theme.reducedMotion ? 0 : Ui.Metrics.motionQuick; easing.type: Easing.InCubic }
        NumberAnimation { property: "scale"; from: 1; to: 0.98; duration: Ui.Theme.reducedMotion ? 0 : Ui.Metrics.motionQuick; easing.type: Easing.InCubic }
    }

    contentItem: Item {
        focus: true
        Keys.onLeftPressed: viewer.step(-1)
        Keys.onRightPressed: viewer.step(1)
        Keys.onSpacePressed: if (player.item) player.item.togglePlay()
        Keys.onPressed: event => {
            if (event.key === Qt.Key_Home) { viewer.show(0); event.accepted = true }
            else if (event.key === Qt.Key_End) { viewer.show(viewer.items.length - 1); event.accepted = true }
        }
        ColumnLayout {
            anchors.fill: parent
            spacing: Ui.Metrics.md
            RowLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: Ui.Metrics.md
                Ui.ToolbarIconButton { iconName: "navigateBefore"; text: "Previous (←)"; enabled: viewer.position > 0; onClicked: viewer.step(-1) }
                SwipePager {
                    id: stage
                    objectName: "shotMediaPager"
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    index: viewer.position
                    count: viewer.items.length
                    onStepped: delta => viewer.show(viewer.position + delta)
                    Repeater {
                        model: [-1, 1]
                        delegate: Image {
                            required property int modelData
                            readonly property var entry: viewer.items[viewer.position + modelData] || null
                            x: stage.offset + modelData * stage.pageWidth
                            width: stage.width
                            height: stage.height
                            // Neighbours stay loaded off the page, so a swipe never waits for a decode or an upload.
                            visible: !!entry
                            source: viewer.opened ? viewer.picture(entry, true) : ""
                            sourceSize: viewer.stageDecodeSize
                            retainWhileLoading: true
                            fillMode: Image.PreserveAspectFit
                            asynchronous: true
                        }
                    }
                    Item {
                        x: stage.offset
                        width: stage.width
                        height: stage.height
                        Image {
                            anchors.fill: parent
                            // A clip shows its still until the player has a frame, and while it slides.
                            visible: viewer.kind === "image" || !player.item || stage.moving
                            source: viewer.picture(viewer.item, true)
                            sourceSize: viewer.stageDecodeSize
                            retainWhileLoading: true
                            fillMode: Image.PreserveAspectFit
                            asynchronous: true
                        }
                        Loader {
                            id: player
                            anchors.fill: parent
                            active: viewer.opened && viewer.kind === "video" && !!viewer.item && !!viewer.clipPlayer
                            sourceComponent: viewer.clipPlayer
                            onLoaded: {
                                item.durationMs = Qt.binding(() => { const seconds = Number(viewer.item ? viewer.item.take.duration : 0); return isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0 })
                                item.assetId = Qt.binding(() => viewer.item ? viewer.assetId(viewer.item.take) : "")
                            }
                        }
                    }
                }
                Ui.ToolbarIconButton { iconName: "navigateNext"; text: "Next (→)"; enabled: viewer.position < viewer.items.length - 1; onClicked: viewer.step(1) }
            }
            // The strip shows every shot in order, with a scene label at the start of each scene.
            ListView {
                id: strip
                objectName: "shotMediaStrip"
                Layout.fillWidth: true
                Layout.preferredHeight: Ui.Metrics.comfortable * 2 + Ui.Metrics.lg
                orientation: ListView.Horizontal
                spacing: Ui.Metrics.sm
                clip: true
                model: viewer.items
                currentIndex: viewer.position
                highlightMoveDuration: Ui.Theme.reducedMotion ? 0 : Ui.Metrics.motionNormal
                highlightRangeMode: ListView.ApplyRange
                preferredHighlightBegin: width / 2 - Ui.Metrics.comfortable * 2
                preferredHighlightEnd: width / 2 + Ui.Metrics.comfortable * 2
                delegate: Column {
                    id: cell
                    required property var modelData
                    required property int index
                    spacing: Ui.Metrics.micro
                    Ui.Text {
                        text: cell.modelData.firstInScene ? "Scene " + cell.modelData.scene : " "
                        role: Ui.Typography.MonoCaption
                        tone: Ui.Text.Secondary
                    }
                    Rectangle {
                        width: Ui.Metrics.comfortable * 2 * 16 / 9
                        height: Ui.Metrics.comfortable * 2
                        radius: Ui.Metrics.radiusControl
                        color: Ui.Theme.actionHover
                        border.width: cell.index === viewer.position ? Ui.Metrics.focus : Ui.Metrics.none
                        border.color: Ui.Theme.accentPrimary
                        opacity: cell.index === viewer.position ? 1 : 0.6
                        Behavior on opacity { enabled: !Ui.Theme.reducedMotion; NumberAnimation { duration: Ui.Metrics.motionQuick } }
                        StableImage {
                            anchors.fill: parent
                            anchors.margins: parent.border.width
                            source: viewer.opened ? viewer.picture(cell.modelData, false) : ""
                            fillMode: Image.PreserveAspectCrop
                            Component.onCompleted: if (viewer.mediaBrowser) viewer.mediaBrowser.requestThumbnail(viewer.assetId(cell.modelData.take))
                        }
                        TapHandler { onTapped: viewer.show(cell.index) }
                    }
                }
            }
        }
    }
    footer: RowLayout {
        Item { Layout.fillWidth: true }
        Ui.EditorButton { Layout.margins: Ui.Metrics.md; text: "Close"; onClicked: viewer.close() }
    }
}
