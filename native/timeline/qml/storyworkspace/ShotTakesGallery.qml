import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import "shotDraft.js" as Draft

// Every still and clip take of one shot. A click on a take makes it the current still or clip; the
// current take opens full screen. A port of web ShotTakesGallery.
ColumnLayout {
    id: gallery
    objectName: "shotTakesGallery"
    required property var shot
    property var shots: []
    property var mediaBrowser: null
    property var timeline: null
    property bool readOnly: false
    property bool expanded: false
    signal acceptRequested(string kind, int index)
    signal removeRequested(string kind, int index)
    spacing: Ui.Metrics.xs
    visible: stills.length > 0 || clips.length > 0

    readonly property var stills: Draft.versions(shot, "still")
    readonly property var clips: Draft.versions(shot, "clip")
    readonly property bool busy: Draft.isGenerating(shot)
    readonly property real thumbWidth: Ui.Metrics.xxxl * 3.5
    readonly property real labelWidth: Ui.Metrics.xxxl + Ui.Metrics.xs

    function assetId(ref) { return ref ? ref.asset_id || ((ref.uri || "").startsWith("asset://") ? ref.uri.slice(8) : "") : "" }
    function thumbnail(ref) {
        const id = assetId(ref)
        if (!id || !mediaBrowser) return ""
        mediaBrowser.requestThumbnail(id)
        return mediaBrowser.thumbnails[id] || ""
    }
    function selectedIndex(list, current) {
        if (!current) return -1
        for (let i = 0; i < list.length; ++i) { if (Draft.sameMedia(list[i], current)) return i }
        return -1
    }

    component TakeRow: Flow {
        id: row
        required property string kind
        required property var takes
        required property var current
        readonly property int selected: gallery.selectedIndex(takes, current)
        Layout.fillWidth: true
        spacing: Ui.Metrics.micro
        visible: takes.length > 0
        Ui.Text {
            width: gallery.labelWidth
            height: gallery.thumbWidth * 9 / 16
            verticalAlignment: Text.AlignVCenter
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            text: row.kind === "video" ? "Clips" : "Stills"
        }
        Repeater {
            model: row.takes
            delegate: Item {
                id: take
                required property var modelData
                required property int index
                readonly property bool isCurrent: index === row.selected
                readonly property string noun: row.kind === "video" ? "clip" : "still"
                width: gallery.thumbWidth
                height: width * 9 / 16
                Ui.EditorButton {
                    id: thumb
                    objectName: "shotTake_" + row.kind + "_" + take.index
                    anchors.fill: parent
                    active: take.isCurrent
                    text: String(take.index + 1)
                    accessibleName: take.isCurrent ? (row.kind === "video" ? "Clip " : "Still ") + (take.index + 1) + " is current"
                        : gallery.readOnly ? "Preview " + take.noun + " " + (take.index + 1)
                        : "Use " + take.noun + " " + (take.index + 1) + " as the current " + take.noun
                    Accessible.selected: take.isCurrent
                    onClicked: gallery.readOnly || take.isCurrent ? viewer.openTake(row.kind, take.modelData) : gallery.acceptRequested(row.kind, take.index)
                }
                Image {
                    anchors.fill: parent
                    anchors.margins: take.isCurrent ? Ui.Metrics.focus : Ui.Metrics.border
                    source: gallery.thumbnail(take.modelData)
                    visible: status === Image.Ready
                    fillMode: Image.PreserveAspectCrop
                    asynchronous: true
                    clip: true
                }
                Rectangle {
                    anchors.fill: parent
                    color: "transparent"
                    radius: Ui.Metrics.radiusControl
                    border.width: take.isCurrent ? Ui.Metrics.focus : 0
                    border.color: Ui.Theme.accentPrimary
                }
                HoverHandler { id: hover }
                Ui.ToolbarIconButton {
                    objectName: "shotTakeRemove_" + row.kind + "_" + take.index
                    anchors.top: parent.top
                    anchors.right: parent.right
                    anchors.margins: Ui.Metrics.micro
                    visible: !gallery.readOnly && (hover.hovered || activeFocus)
                    iconName: "deleteOutline"
                    variant: Ui.EditorButton.Destructive
                    text: "Remove " + take.noun
                    accessibleName: "Remove " + take.noun + " " + (take.index + 1)
                    enabled: !gallery.busy
                    onClicked: gallery.removeRequested(row.kind, take.index)
                }
                Ui.ToolbarIconButton {
                    objectName: "shotTakeFullscreen_" + row.kind + "_" + take.index
                    anchors.bottom: parent.bottom
                    anchors.right: parent.right
                    anchors.margins: Ui.Metrics.micro
                    visible: hover.hovered || activeFocus
                    iconName: "fullscreen"
                    text: "View fullscreen"
                    accessibleName: "View " + take.noun + " " + (take.index + 1) + " fullscreen"
                    onClicked: viewer.openTake(row.kind, take.modelData)
                }
            }
        }
    }

    TakeRow { kind: "image"; takes: gallery.stills; current: gallery.shot.keyframe }
    TakeRow { kind: "video"; takes: gallery.clips; current: gallery.shot.clip }

    Ui.EditorButton {
        objectName: "shotTakesToggle"
        variant: Ui.EditorButton.Flat
        textTone: Ui.Text.Secondary
        text: gallery.expanded ? "Hide takes" : "View takes"
        onClicked: gallery.expanded = !gallery.expanded
    }

    ColumnLayout {
        Layout.fillWidth: true
        visible: gallery.expanded
        spacing: Ui.Metrics.xs
        Repeater {
            model: [{kind: "image", label: "Stills", takes: gallery.stills}, {kind: "video", label: "Clips", takes: gallery.clips}]
            delegate: ColumnLayout {
                id: section
                required property var modelData
                Layout.fillWidth: true
                visible: modelData.takes.length > 0
                spacing: Ui.Metrics.xs
                Ui.Text { text: section.modelData.label; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                GridLayout {
                    Layout.fillWidth: true
                    columns: Math.max(1, Math.floor(width / (gallery.thumbWidth * 2)))
                    columnSpacing: Ui.Metrics.xs
                    rowSpacing: Ui.Metrics.xs
                    Repeater {
                        model: section.modelData.takes
                        delegate: Item {
                            id: large
                            required property var modelData
                            required property int index
                            Layout.fillWidth: true
                            Layout.preferredHeight: width * 9 / 16
                            Rectangle { anchors.fill: parent; radius: Ui.Metrics.radiusControl; color: Ui.Theme.actionHover }
                            Image {
                                anchors.fill: parent
                                source: gallery.thumbnail(large.modelData)
                                fillMode: Image.PreserveAspectFit
                                asynchronous: true
                            }
                            Ui.ToolbarIconButton {
                                anchors.right: parent.right
                                anchors.bottom: parent.bottom
                                anchors.margins: Ui.Metrics.micro
                                iconName: section.modelData.kind === "video" ? "playArrow" : "fullscreen"
                                text: (section.modelData.kind === "video" ? "Play clip " : "View still ") + (large.index + 1)
                                onClicked: viewer.openTake(section.modelData.kind, large.modelData)
                            }
                        }
                    }
                }
            }
        }
    }

    ShotMediaViewer {
        id: viewer
        shots: gallery.shots
        mediaBrowser: gallery.mediaBrowser
        timeline: gallery.timeline
    }
}
