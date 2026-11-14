import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// Web: ImageComparisonRenderer.tsx and widgets/ImageComparer.tsx. Image A is
// revealed over image B by a wipe that follows the pointer.
ColumnLayout {
    id: root
    objectName: "output-comparison"
    required property var comparison
    // The tab's MediaResolver, which reads both images.
    property var resolver: null
    property string mode: "horizontal"
    property real position: 0.5
    readonly property bool horizontal: mode === "horizontal"
    readonly property string labelA: comparison.label_a || "A"
    readonly property string labelB: comparison.label_b || "B"
    readonly property bool missing: !hasImage(comparison.image_a) || !hasImage(comparison.image_b)
    spacing: Ui.Metrics.xs
    EditorRoles { id: roles }

    function hasImage(image) {
        if (!image) return false
        if (image.uri || image.asset_id) return true
        const data = image.data
        return data !== undefined && data !== null && (typeof data === "object" && data.length === undefined ? true : data.length > 0)
    }
    function dimensions(layer) {
        return layer.natural.width > 0 ? layer.natural.width + " × " + layer.natural.height : ""
    }
    function track(point) {
        const value = horizontal ? point.x / viewport.width : point.y / viewport.height
        position = Math.max(0, Math.min(1, value))
    }
    function toggleMode() {
        mode = horizontal ? "vertical" : "horizontal"
        position = 0.5
    }

    // One image side. It resolves through the shared media resolver, so asset,
    // package and API references carry the account credentials, and it fits the
    // image on its own: centered, never upscaled, aspect ratio kept.
    component ComparisonLayer: Item {
        id: layer
        required property var locator
        required property string side
        required property string requestKey
        property var resolver: null
        property bool active: true
        property string resolverKey: ""
        property url resolvedSource: ""
        property string failure: ""
        property bool resolving: false
        // The locator binding also changes during creation. Resolving only after
        // completion sends one request per side instead of a cancelled duplicate.
        property bool completed: false
        readonly property bool loading: resolving || image.status === Image.Loading
        readonly property size natural: image.status === Image.Ready ? Qt.size(image.implicitWidth, image.implicitHeight) : Qt.size(0, 0)
        function reset() {
            const previousKey = resolverKey
            resolverKey = ""
            if (resolver && previousKey) resolver.cancel(previousKey)
            resolvedSource = ""
            if (resolver && previousKey) resolver.release(previousKey)
            failure = ""; resolving = false
        }
        function resolve() {
            reset()
            if (!active || !resolver || !locator) return
            resolverKey = requestKey
            resolving = true
            resolver.resolve(resolverKey, locator)
        }
        onLocatorChanged: if (completed) resolve()
        onActiveChanged: if (completed) resolve()
        Component.onCompleted: { completed = true; resolve() }
        Component.onDestruction: reset()
        Connections {
            target: layer.resolver
            function onResolved(key, url) {
                if (key !== layer.resolverKey) return
                layer.resolving = false
                layer.resolvedSource = url
            }
            function onFailed(key, message) { if (key === layer.resolverKey) { layer.reset(); layer.failure = message } }
            function onCleared() { layer.reset() }
        }
        Image {
            id: image
            readonly property real fit: implicitWidth > 0 && implicitHeight > 0 ? Math.min(1, layer.width / implicitWidth, layer.height / implicitHeight) : 0
            anchors.centerIn: parent
            width: implicitWidth * fit
            height: implicitHeight * fit
            source: layer.resolvedSource
            fillMode: Image.Stretch
            // The resolver holds the bytes in a local file, but decoding a large image on the GUI
            // thread freezes the editor. The layer decodes off-thread and the checker shows until
            // it is ready (`natural` and `fit` already wait for Image.Ready).
            asynchronous: true
            onStatusChanged: if (status === Image.Error) layer.failure = "Unable to display image"
        }
    }

    // One overlay chip over the scrim: labels and dimensions.
    Ui.Text {
        Layout.fillWidth: true
        visible: root.missing
        text: "Missing image data for comparison"
        role: Ui.Typography.SansCaption
        wrapMode: Text.Wrap
    }
    Item {
        id: viewport
        objectName: "comparison-drag"
        visible: !root.missing
        Layout.fillWidth: true
        Layout.fillHeight: true
        Layout.minimumHeight: roles.comparisonMinimumHeight
        Layout.preferredHeight: roles.comparisonMinimumHeight
        clip: true
        readonly property real inset: Ui.Metrics.md
        readonly property real toggleReserve: toggle.width + Ui.Metrics.xxl + Ui.Metrics.xs
        Accessible.role: Accessible.Graphic
        Accessible.name: "Image comparison"
        Accessible.description: root.labelA + (root.dimensions(layerA) ? " " + root.dimensions(layerA) : "") + " compared with " + root.labelB + (root.dimensions(layerB) ? " " + root.dimensions(layerB) : "") + ", " + (root.horizontal ? "horizontal" : "vertical") + " wipe"

        Image {
            anchors.fill: parent
            fillMode: Image.Tile
            horizontalAlignment: Image.AlignLeft
            verticalAlignment: Image.AlignTop
            sourceSize: Qt.size(2 * Ui.Metrics.sm, 2 * Ui.Metrics.sm)
            source: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + 2 * Ui.Metrics.sm + '" height="' + 2 * Ui.Metrics.sm + '"><rect width="100%" height="100%" fill="' + roles.alphaBase + '"/><rect width="' + Ui.Metrics.sm + '" height="' + Ui.Metrics.sm + '" fill="' + roles.alphaChecker + '"/><rect x="' + Ui.Metrics.sm + '" y="' + Ui.Metrics.sm + '" width="' + Ui.Metrics.sm + '" height="' + Ui.Metrics.sm + '" fill="' + roles.alphaChecker + '"/></svg>')
        }
        ComparisonLayer {
            id: layerB
            resolver: root.resolver
            anchors.fill: parent
            side: "B"
            active: !root.missing
            requestKey: "comparison-" + String(root) + "-b"
            locator: Object.assign({type: "image"}, root.comparison.image_b)
        }
        // Only the clip rectangle of A changes with the wipe. A's own layer keeps
        // the full viewport, so the image never refits while the divider moves.
        Item {
            width: root.horizontal ? viewport.width * root.position : viewport.width
            height: root.horizontal ? viewport.height : viewport.height * root.position
            visible: width > 0 && height > 0
            clip: true
            ComparisonLayer {
                id: layerA
                resolver: root.resolver
                width: viewport.width; height: viewport.height
                side: "A"
                active: !root.missing
                requestKey: "comparison-" + String(root) + "-a"
                locator: Object.assign({type: "image"}, root.comparison.image_a)
            }
        }
        Rectangle {
            visible: mouseHover.hovered || penHover.hovered || drag.active
            x: root.horizontal ? viewport.width * root.position - width / 2 : 0
            y: root.horizontal ? 0 : viewport.height * root.position - height / 2
            width: root.horizontal ? Ui.Metrics.focus : viewport.width
            height: root.horizontal ? viewport.height : Ui.Metrics.focus
            color: Ui.Theme.textOnAccent
        }

        Ui.Chip {
            x: viewport.inset; y: viewport.inset
            text: root.labelA
            maximumWidth: root.horizontal ? (viewport.width - 3 * viewport.inset) / 2 : viewport.width - 2 * viewport.inset
        }
        Ui.Chip {
            x: root.horizontal ? viewport.width - viewport.inset - width : viewport.inset
            y: root.horizontal ? viewport.inset : viewport.height - viewport.inset - height
            text: root.labelB
            maximumWidth: root.horizontal ? (viewport.width - 3 * viewport.inset) / 2 : viewport.width - 2 * viewport.inset
        }
        Ui.Chip {
            id: metadataA
            x: viewport.inset
            y: root.horizontal ? viewport.height - viewport.inset - height : Ui.Metrics.xxxl
            text: root.dimensions(layerA)
            ink: roles.comparisonMetadataInk
            maximumWidth: root.horizontal ? (viewport.width - 3 * viewport.inset) / 2 : viewport.width - 2 * viewport.inset
        }
        Ui.Chip {
            x: root.horizontal ? viewport.width - viewport.toggleReserve - width : viewport.inset
            y: viewport.height - (root.horizontal ? viewport.inset : Ui.Metrics.xxxl) - height
            text: root.dimensions(layerB)
            ink: roles.comparisonMetadataInk
            maximumWidth: root.horizontal ? Math.max(0, viewport.width - viewport.toggleReserve - metadataA.x - metadataA.width - Ui.Metrics.xs) : viewport.width - 2 * viewport.inset
        }

        Column {
            anchors.centerIn: parent
            width: Math.min(parent.width - 2 * viewport.inset, implicitWidth)
            spacing: Ui.Metrics.xs
            Repeater {
                model: [layerA, layerB]
                Row {
                    id: status
                    required property var modelData
                    visible: modelData.failure.length > 0 || modelData.loading
                    spacing: Ui.Metrics.sm
                    anchors.horizontalCenter: parent.horizontalCenter
                    Ui.Chip {
                        anchors.verticalCenter: parent.verticalCenter
                        text: status.modelData.failure.length > 0 ? status.modelData.side + ": " + status.modelData.failure : "Loading " + status.modelData.side + "…"
                        maximumWidth: viewport.width - 2 * viewport.inset - retry.width - Ui.Metrics.sm
                    }
                    Ui.EditorButton {
                        id: retry
                        anchors.verticalCenter: parent.verticalCenter
                        visible: status.modelData.failure.length > 0
                        text: "Retry " + status.modelData.side
                        variant: Ui.EditorButton.Outlined; flat: true
                        onClicked: status.modelData.resolve()
                    }
                }
            }
        }

        Ui.EditorButton {
            id: toggle
            objectName: "comparison-mode"
            anchors.right: parent.right; anchors.rightMargin: Ui.Metrics.xxl
            anchors.bottom: parent.bottom; anchors.bottomMargin: Ui.Metrics.md
            accessibleName: root.horizontal ? "Switch to vertical" : "Switch to horizontal"
            variant: Ui.EditorButton.Outlined; flat: true
            onClicked: root.toggleMode()
            background: Rectangle {
                radius: Ui.Metrics.radiusControl
                color: Ui.Theme.scrimMedia
                border.width: toggle.visualFocus ? Ui.Metrics.focus : 0
                border.color: Ui.Theme.borderFocus
            }
            Ui.Icon {
                anchors.centerIn: parent
                name: "swapHoriz"
                size: Ui.Metrics.iconSm
                domainColor: Ui.Theme.textOnAccent
                rotation: root.horizontal ? 90 : 0
            }
        }

        // A mouse follows the pointer without a button and recenters on leave. Entering
        // only records where the pointer is. A window that appears under a resting
        // pointer gets an enter event without any movement, which the web ignores too.
        // Touch contact also reaches this handler as a synthesized mouse that enters
        // and leaves, so only a leave after real mouse movement recenters.
        HoverHandler {
            id: mouseHover
            property point seen
            property bool moved: false
            acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
            cursorShape: root.horizontal ? Qt.SplitHCursor : Qt.SplitVCursor
            onPointChanged: {
                if (!hovered || point.scenePosition === seen) return
                seen = point.scenePosition
                moved = !drag.active
                if (moved) root.track(point.position)
            }
            onHoveredChanged: {
                if (hovered) { seen = point.scenePosition; return }
                if (moved) root.position = 0.5
                moved = false
            }
        }
        // A pen follows the pointer but keeps its position on leave, like touch.
        HoverHandler {
            id: penHover
            acceptedDevices: PointerDevice.Stylus
            onPointChanged: if (hovered) root.track(point.position)
        }
        // Touch, pen contact and a pressed mouse claim the wipe axis. Horizontal mode leaves vertical
        // movement to the surrounding scroll view, which scrolls vertically only.
        // Vertical mode claims the scroll axis itself, as the web's pan-x does, and
        // a drag handler with only its y axis enabled ignores movement that is mostly
        // horizontal, so it accepts both axes there.
        DragHandler {
            id: drag
            target: null
            acceptedDevices: PointerDevice.TouchScreen | PointerDevice.Stylus | PointerDevice.Mouse
            xAxis.enabled: true
            yAxis.enabled: !root.horizontal
            onCentroidChanged: if (active) root.track(centroid.position)
            onActiveChanged: if (active) { if (centroid.device.type !== PointerDevice.Mouse) mouseHover.moved = false; root.track(centroid.position) }
        }
    }
}
