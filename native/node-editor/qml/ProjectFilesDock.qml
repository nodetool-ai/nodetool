import QtQuick
import NodeTool.Files
import NodeTool.MediaPlayer
import NodeTool.UiPrimitives as Ui

// The Files dock: the shared FilesPanel with the shared player in its preview.
// A file in a local project folder plays from disk. A file on the server is
// read through the tab's MediaResolver, which sends the account's
// credentials, and then plays from its local copy.
FilesPanel {
    id: panel
    objectName: "projectFilesDock"
    // The MediaResolver of the window.
    property var resolver: null
    previewDelegate: Component {
        Item {
            id: host
            objectName: "files-preview-host"
            property url source
            property string kind
            property url playable: ""
            property string failure: ""
            readonly property string key: "files-preview"
            function load() {
                failure = ""
                if (!panel.resolver) { playable = ""; return }
                panel.resolver.cancel(key)
                if (source.toString().startsWith("file:")) { playable = source; return }
                playable = ""
                if (source.toString() !== "") panel.resolver.resolve(key, source.toString())
            }
            onSourceChanged: load()
            Component.onCompleted: load()
            Component.onDestruction: if (panel.resolver) { panel.resolver.cancel(key); panel.resolver.release(key) }
            Connections {
                target: panel.resolver
                function onResolved(key, url) { if (key === host.key) host.playable = url }
                function onFailed(key, message) { if (key === host.key) host.failure = message }
            }
            MediaPlayer {
                objectName: "files-preview-media-player"
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                height: host.kind === "video" ? parent.height : implicitHeight
                visible: host.playable.toString() !== ""
                source: host.playable
                kind: host.kind
                label: panel.files.previewName
                compact: true
            }
            Ui.BusyIndicator {
                anchors.centerIn: parent
                running: host.playable.toString() === "" && host.failure === ""
                visible: running
            }
            Ui.Text {
                anchors.centerIn: parent
                width: parent.width - 2 * Ui.Metrics.md
                visible: host.failure !== ""
                text: host.failure
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.Wrap
            }
        }
    }
}
