// nt-panel: slot=bottom id=source order=10 title="Source"
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import "../src/edit/inspectorsections" as Sections
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    objectName: "sourceViewer"
    implicitWidth: TimelineMetrics.sourceViewerPreferredWidth
    implicitHeight: visible ? content.implicitHeight + Ui.Metrics.md * 2 : 0
    visible: !!SourceViewerState.asset.id
    color: Ui.Theme.surfaceCanvas
    activeFocusOnTab: true
    Accessible.role: Accessible.Pane
    Accessible.name: "Source monitor"

    property var editor: null
    property var gestures: null
    property var sourceGrid: null
    property real playerTimeMs: 0
    property real scrubBaselineMs: 0
    readonly property var asset: SourceViewerState.asset
    readonly property string mediaType: SourceViewerState.mediaType
    readonly property var selectedAsset: {
        if (!sourceGrid || !sourceGrid.browser || !sourceGrid.selectedId) return null
        const assets = sourceGrid.browser.assets || []
        for (let i = 0; i < assets.length; ++i) {
            if (assets[i] && assets[i].id === sourceGrid.selectedId) return assets[i]
        }
        return null
    }
    Binding {
        target: SourceViewerState
        property: "mediaBrowser"
        value: root.sourceGrid && root.sourceGrid.browser &&
               typeof root.sourceGrid.browser.resolveClipMedia === "function" ? root.sourceGrid.browser : null
    }
    onSelectedAssetChanged: SourceViewerState.asset = selectedAsset || ({})
    property string playerAssetId: ""
    onAssetChanged: {
        const id = asset.id || ""
        if (id !== playerAssetId) { playerTimeMs = 0; playerAssetId = id }
    }

    // Keep editor, gesture and Library discovery together for the dock replacement.
    function attach() {
        let above = parent
        while (above && (above.timeline === undefined || above.clock === undefined)) above = above.parent
        editor = above
        gestures = null
        sourceGrid = null
        let fallbackGrid = null
        function visit(item, inLibrary) {
            if (!item) return
            const library = inLibrary || item.objectName === "assetExplorer"
            if (!gestures && item.gestures !== undefined) gestures = item.gestures
            if (library && item.selectedId !== undefined && item.browser !== undefined) {
                if (!fallbackGrid) fallbackGrid = item
                if (!sourceGrid && item.selectedId) sourceGrid = item
            }
            const children = item.children || []
            for (let i = 0; i < children.length; ++i) visit(children[i], library)
        }
        visit(editor, false)
        if (!sourceGrid) sourceGrid = fallbackGrid
    }
    Component.onCompleted: Qt.callLater(attach)
    onParentChanged: Qt.callLater(attach)

    function posterUrl() {
        let path = asset.thumb_url || (mediaType === "image" ? asset.get_url || "" : "")
        if (sourceGrid && sourceGrid.browser && typeof sourceGrid.browser.mediaUrl === "function")
            return sourceGrid.browser.mediaUrl(path)
        return path
    }
    function mark(edge) {
        if (mediaType !== "video") return
        if (edge === "in") SourceViewerState.markIn(playerTimeMs)
        else SourceViewerState.markOut(playerTimeMs)
    }
    Keys.onPressed: event => {
        if (event.modifiers !== Qt.NoModifier || mediaType !== "video") return
        if (event.key === Qt.Key_I || event.key === Qt.Key_O) {
            mark(event.key === Qt.Key_I ? "in" : "out")
            event.accepted = true
        }
    }

    Flickable {
        anchors.fill: parent
        contentHeight: content.implicitHeight + Ui.Metrics.md * 2
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: Ui.ScrollBar {}
        Column {
            id: content
            x: Ui.Metrics.md
            y: Ui.Metrics.md
            width: parent.width - Ui.Metrics.md * 2
            spacing: Ui.Metrics.md
            Ui.Text {
                objectName: "sourceEmptyState"
                width: parent.width
                visible: !root.asset.id
                text: "Select an asset in the library to view it here"
                wrapMode: Text.WordWrap
                role: Ui.Typography.SansLabel
                tone: Ui.Text.Secondary
            }
            Ui.Text {
                id: sourceName
                objectName: "sourceName"
                width: parent.width
                text: root.asset.name || ""
                elide: Text.ElideRight
                role: Ui.Typography.SansLabel
                Ui.Tooltip { trigger: sourceName; visible: nameHover.hovered && sourceName.truncated; text: sourceName.text }
                HoverHandler { id: nameHover }
            }
            Rectangle {
                width: parent.width
                implicitHeight: media.implicitHeight
                color: Ui.Theme.surfaceCanvas
                radius: Ui.Metrics.xs
                clip: true
                Column {
                    id: media
                    width: parent.width
                    spacing: Ui.Metrics.xs
                    Image {
                        objectName: "sourcePoster"
                        width: parent.width
                        height: visible ? width * 9 / 16 : 0
                        visible: root.mediaType === "image" || root.mediaType === "video"
                        source: root.posterUrl()
                        asynchronous: true
                        fillMode: Image.PreserveAspectFit
                        Accessible.name: root.asset.name || ""
                    }
                    Ui.Slider {
                        objectName: "sourceScrub"
                        width: parent.width
                        visible: root.mediaType === "video" || root.mediaType === "audio"
                        from: 0
                        to: Math.max(1, SourceViewerState.durationMs)
                        value: root.playerTimeMs
                        onEditStarted: root.scrubBaselineMs = root.playerTimeMs
                        onValuePreviewed: value => root.playerTimeMs = Math.round(value)
                        onValueCommitted: value => root.playerTimeMs = Math.round(value)
                        onEditCanceled: root.playerTimeMs = root.scrubBaselineMs
                        accessibleName: "Source time"
                        density: Ui.EditorButton.Compact
                    }
                    Ui.Text {
                        width: parent.width
                        visible: !root.mediaType
                        text: "This asset type cannot go on the timeline."
                        wrapMode: Text.WordWrap
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                }
            }
            InspectorRow {
                width: parent.width
                label: "In"
                InspectorPillInput {
                    objectName: "sourceIn"
                    value: (SourceViewerState.inMs / 1000).toFixed(2)
                    unit: "s"
                    ariaLabel: "Source in point"
                    onCommit: raw => SourceViewerState.setIn(raw)
                }
                Sections.InspectorActionButton {
                    objectName: "sourceMarkIn"
                    visible: root.mediaType === "video"
                    text: "Mark in"
                    outlined: false
                    shortcutText: "I"
                    onClicked: root.mark("in")
                }
            }
            InspectorRow {
                width: parent.width
                label: "Out"
                InspectorPillInput {
                    objectName: "sourceOut"
                    value: (SourceViewerState.outMs / 1000).toFixed(2)
                    unit: "s"
                    ariaLabel: "Source out point"
                    onCommit: raw => SourceViewerState.setOut(raw)
                }
                Sections.InspectorActionButton {
                    objectName: "sourceMarkOut"
                    visible: root.mediaType === "video"
                    text: "Mark out"
                    outlined: false
                    shortcutText: "O"
                    onClicked: root.mark("out")
                }
            }
            Ui.Text {
                objectName: "sourceRangeSummary"
                width: parent.width
                text: "Range " + ((SourceViewerState.outMs - SourceViewerState.inMs) / 1000).toFixed(2)
                    + " s. Insert and Overwrite land at the playhead on the first unlocked track that fits the media."
                wrapMode: Text.WordWrap
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
            Flow {
                width: parent.width
                spacing: Ui.Metrics.sm
                Repeater {
                    model: ["Append", "Insert", "Overwrite"]
                    delegate: Sections.InspectorActionButton {
                        required property string modelData
                        objectName: "source" + modelData
                        text: modelData
                        iconName: modelData === "Append" ? "playlistAdd" : modelData === "Insert" ? "keyboardTab" : "flipToFront"
                        enabled: !!root.mediaType
                        shortcutText: SourceViewerState.shortcut(modelData.toLowerCase(), root.gestures ? root.gestures.keyboardPreset : "nodetool")
                        onClicked: SourceViewerState.perform(modelData.toLowerCase(), root.gestures)
                    }
                }
            }
        }
    }
}
