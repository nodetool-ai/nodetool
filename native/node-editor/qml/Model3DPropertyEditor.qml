import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    required property var descriptor
    required property var value
    required property bool writable
    required property string nodeId
    // The tab's AssetPickerController, from the property host.
    property var controller: null
    property string requestKey: "model3d-" + String(root)
    property int generation: 0
    readonly property string uploadKey: requestKey + "-upload-" + generation
    readonly property string metadataKey: requestKey + "-metadata-" + generation
    readonly property string uri: value && value.uri ? value.uri : ""
    property bool showUrl: false
    property bool uploading: false
    property string error: ""
    property var asset: ({})
    signal valueCommitted(var value)
    signal scopeInvalidated()
    // Report on an error opens a prefilled bug report: the source label and the error text.
    signal reportRequested(string source, string text)
    spacing: Ui.Metrics.xs
    function cancelEdit() {
        if (controller) {
            controller.cancel(uploadKey)
            controller.cancel(metadataKey)
        }
        ++generation
        uploading = false
        error = ""
    }
    function describe() {
        if (controller) { controller.cancel(metadataKey) }
        asset = ({})
        if (controller && value && value.asset_id) {
            controller.describe(metadataKey, value.asset_id)
        }
    }
    function commit(reference) {
        if (writable && !(value && Object.keys(value).length === Object.keys(reference).length && Object.keys(reference).every(key => value[key] === reference[key]))) {
            valueCommitted(reference)
        }
    }
    function upload(url) {
        if (!writable || !controller) { return }
        cancelEdit()
        uploading = true
        controller.upload(uploadKey, "asset", url)
    }
    onValueChanged: describe()
    onNodeIdChanged: cancelEdit()
    onWritableChanged: if (!writable) { cancelEdit() }
    Component.onCompleted: describe()
    Component.onDestruction: cancelEdit()
    Connections {
        target: root.controller
        function onCleared() {
            root.cancelEdit()
            root.asset = ({})
            root.scopeInvalidated()
        }
        function onDescribed(key, asset) {
            if (key === root.metadataKey) { root.asset = asset }
        }
        function onUploaded(key, reference) {
            if (key !== root.uploadKey || !root.writable) { return }
            root.uploading = false
            root.commit({type: "model_3d", uri: reference.uri, asset_id: reference.asset_id})
        }
        function onFailed(key, message) {
            if (key !== root.uploadKey) { return }
            root.uploading = false
            root.error = message
        }
    }
    Ui.Icon {
        visible: root.descriptor.connected === true
        name: "link"
        Accessible.ignored: false
        Accessible.name: "Connected"
    }
    Item {
        Layout.fillWidth: true
        implicitHeight: 0
        visible: !root.descriptor.connected
        Ui.EditorButton {
            objectName: "model3d-toggle-url"
            anchors.right: parent.right
            anchors.bottom: parent.top
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            textRole: Ui.Typography.SansCaption
            text: root.showUrl ? "X" : "URL"
            accessibleName: root.showUrl ? "Hide URL input" : "Show input to enter a URL"
            enabled: root.writable
            onClicked: root.showUrl = !root.showUrl
        }
    }
    Ui.TextField {
        objectName: "model3d-url"
        Layout.fillWidth: true
        visible: root.showUrl && !root.descriptor.connected
        accessibleName: "3D model URL"
        placeholderText: "Enter 3D model URL"
        value: root.uri
        enabled: root.writable
        onValueCommitted: value => root.commit({uri: value, type: "model_3d"})
    }
    DropArea {
        visible: !root.descriptor.connected
        objectName: "model3d-drop"
        Layout.fillWidth: true
        implicitHeight: Ui.Metrics.touch * 3
        enabled: root.writable && !root.uploading
        onDropped: drop => {
            if (drop.hasUrls && drop.urls.length === 1) {
                root.upload(drop.urls[0])
                drop.acceptProposedAction()
            }
        }
        Rectangle {
            anchors.fill: parent
            color: Ui.Theme.surfaceInput
            radius: Ui.Metrics.radiusControl
            border.width: Ui.Metrics.border
            border.color: parent.containsDrag ? Ui.Theme.borderFocus : Ui.Theme.borderControl
        }
        ColumnLayout {
            anchors.fill: parent
            anchors.margins: Ui.Metrics.md
            Image {
                Layout.fillWidth: true
                Layout.fillHeight: true
                visible: source.toString() !== ""
                source: root.asset.thumb_url || root.asset.thumbnail_url || root.asset.thumbnail || ""
                fillMode: Image.PreserveAspectFit
            }
            Ui.Text {
                objectName: "model3d-preview-name"
                Layout.fillWidth: true
                Layout.fillHeight: true
                text: root.uploading ? "Uploading…" : root.uri ? root.asset.name || root.uri.split("/").pop() : "Drop 3D model (GLB, GLTF)"
                horizontalAlignment: Text.AlignHCenter
                verticalAlignment: Text.AlignVCenter
                wrapMode: Text.WrapAnywhere
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
        }
    }
    Ui.Banner {
        objectName: "model3d-error"
        Layout.fillWidth: true
        visible: root.error !== ""
        status: Ui.Status.Error
        message: root.error
        reportable: true
        onReportRequested: root.reportRequested(qsTr("Model 3D error"), root.error)
    }
}
