import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import "shotDraft.js" as Draft

// Full-screen pass over the board's stills or clips, in shot order. Arrow keys step, Space plays.
// A port of web ShotMediaViewer.
Ui.Dialog {
    id: viewer
    objectName: "shotMediaViewer"
    property var shots: []
    property var mediaBrowser: null
    property var timeline: null
    function assetId(ref) { return ref ? ref.asset_id || ((ref.uri || "").startsWith("asset://") ? ref.uri.slice(8) : "") : "" }
    property string kind: "image"
    property int position: -1
    readonly property var items: {
        const list = []
        for (const group of Draft.sceneOrder(viewer.shots)) {
            for (const shot of group.shots) {
                const takes = Draft.versions(shot, kind === "video" ? "clip" : "still")
                for (let i = 0; i < takes.length; ++i) list.push({shot: shot, take: takes[i], number: i + 1})
            }
        }
        return list
    }
    readonly property var item: position >= 0 && position < items.length ? items[position] : null
    function openTake(nextKind, take) {
        kind = nextKind
        position = Math.max(0, items.findIndex(entry => Draft.sameMedia(entry.take, take)))
        show(position)
        open()
    }
    function show(next) {
        if (next < 0 || next >= items.length) return
        position = next
        if (kind === "image" && viewer.mediaBrowser) {
            viewer.mediaBrowser.requestThumbnail(viewer.assetId(items[next].take))
        }
    }
    x: 0
    y: 0
    width: parent ? parent.width : 0
    height: parent ? parent.height : 0
    title: item ? "Shot " + (item.shot.index + 1) + " · " + (kind === "video" ? "Clip " : "Still ") + item.number : ""
    onClosed: position = -1
    contentItem: Item {
        focus: true
        Keys.onLeftPressed: viewer.show(viewer.position - 1)
        Keys.onRightPressed: viewer.show(viewer.position + 1)
        Keys.onSpacePressed: if (player.item) player.item.togglePlay()
        RowLayout {
            anchors.fill: parent
            spacing: Ui.Metrics.md
            Ui.ToolbarIconButton { iconName: "navigateBefore"; text: "Previous (←)"; enabled: viewer.position > 0; onClicked: viewer.show(viewer.position - 1) }
            Item {
                Layout.fillWidth: true
                Layout.fillHeight: true
                Image {
                    anchors.fill: parent
                    visible: viewer.kind === "image"
                    readonly property string assetKey: viewer.item ? viewer.assetId(viewer.item.take) : ""
                    source: assetKey && viewer.mediaBrowser ? viewer.mediaBrowser.originals[assetKey] || viewer.mediaBrowser.thumbnails[assetKey] || "" : ""
                    fillMode: Image.PreserveAspectFit
                    asynchronous: true
                    mipmap: true
                }
                Loader {
                    id: player
                    anchors.fill: parent
                    active: viewer.opened && viewer.kind === "video" && !!viewer.item
                    source: "ShotClipPlayer.qml"
                    onLoaded: {
                        item.timeline = Qt.binding(() => viewer.timeline)
                        item.durationMs = Qt.binding(() => { const seconds = Number(viewer.item ? viewer.item.take.duration : 0); return isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0 })
                        item.assetId = Qt.binding(() => viewer.item ? viewer.assetId(viewer.item.take) : "")
                    }
                }
            }
            Ui.ToolbarIconButton { iconName: "navigateNext"; text: "Next (→)"; enabled: viewer.position < viewer.items.length - 1; onClicked: viewer.show(viewer.position + 1) }
        }
    }
    footer: RowLayout {
        Item { Layout.fillWidth: true }
        Ui.EditorButton { Layout.margins: Ui.Metrics.md; text: "Close"; onClicked: viewer.close() }
    }
}
