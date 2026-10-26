import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import NodeTool.Timeline
import "AssetContext.js" as Context

Rectangle {
    id: explorer
    objectName: "assetExplorer"
    property var timeline: null
    property alias browser: browserModel
    implicitWidth: 300
    width: implicitWidth
    height: parent && parent.parent ? parent.parent.height : 600
    color: Theme.backgroundDefault
    clip: true

    AssetBrowser { id: browserModel; timeline: explorer.timeline }
    Component.onCompleted: Qt.callLater(() => {
        const editor = Context.editorFor(explorer)
        explorer.timeline = editor ? editor.timeline : null
        browserModel.refresh()
    })

    Rectangle {
        id: header
        width: parent.width
        height: Theme.toolbarHeight
        color: Theme.backgroundPaper
        Text {
            x: Theme.spacingLg
            anchors.verticalCenter: parent.verticalCenter
            text: "Library"
            color: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            font.weight: Font.Medium
        }
        ToolButton {
            objectName: "assetImportButton"
            anchors.right: parent.right
            anchors.rightMargin: Theme.spacingMd
            anchors.verticalCenter: parent.verticalCenter
            label: browserModel.busy ? "Importing…" : "Import"
            iconPath: Icons.add
            enabled: browserModel.configured && !browserModel.busy
            opacity: enabled ? 1 : 0.4
            onClicked: files.open()
        }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.divider }
    }
    Column {
        id: messages
        x: Theme.spacingLg
        y: header.height + Theme.spacingMd
        width: parent.width - 2 * Theme.spacingLg
        spacing: Theme.spacingMd
        Text {
            width: parent.width
            visible: !browserModel.configured
            text: "Open a server timeline to browse and import assets."
            wrapMode: Text.WordWrap
            color: Theme.textSecondary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
        }
        Text {
            width: parent.width
            visible: browserModel.error !== ""
            text: browserModel.error
            wrapMode: Text.WordWrap
            color: Theme.error
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmaller
        }
        ToolButton {
            visible: browserModel.error !== ""
            label: "Retry"
            enabled: !browserModel.busy
            iconPath: Icons.sync
            onClicked: browserModel.refresh()
        }
        Text {
            visible: browserModel.busy
            text: "Loading assets"
            color: Theme.textSecondary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmaller
        }
    }
    AssetGrid {
        anchors.top: messages.bottom
        anchors.topMargin: Theme.spacingMd
        anchors.bottom: parent.bottom
        width: parent.width
        browser: browserModel
    }
    FileDialog {
        id: files
        title: "Import assets"
        fileMode: FileDialog.OpenFiles
        onAccepted: browserModel.importFiles(selectedFiles)
    }
    DropArea {
        id: fileDrop
        anchors.fill: parent
        keys: ["text/uri-list"]
        enabled: browserModel.configured
        onEntered: drag => { drag.accepted = drag.hasUrls }
        onDropped: drop => {
            if (drop.hasUrls) { browserModel.importFiles(drop.urls); drop.acceptProposedAction() }
        }
        Rectangle {
            anchors.fill: parent
            visible: fileDrop.containsDrag
            color: Theme.actionSelected
            border.color: Theme.primary
            border.width: 2
            Text {
                anchors.centerIn: parent
                text: "Drop files here"
                color: Theme.textPrimary
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmall
            }
        }
    }
    Rectangle { anchors.right: parent.right; height: parent.height; width: 1; color: Theme.divider }
}
