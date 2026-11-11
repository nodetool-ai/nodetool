// nt-panel: slot=overlay id=exportFrame order=42 title="Export frame"
// Export Frame for the Program and Source monitors (issue 7087). The monitor
// and the frame are captured when the dialog opens. src/export/FrameExporter.h
// does the rendering, encoding and upload away from the GUI thread.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../assets/AssetContext.js" as Context

Item {
    id: root
    objectName: "exportFramePanel"
    property var timelineModel: typeof timeline !== "undefined" ? timeline : null
    property var gestures: null
    property alias exporter: frameExporter
    property string target: "program"
    property string detail: ""
    property string destination: "library"
    property string format: "png"
    property string replaceTarget: ""
    readonly property string frameState: frameExporter.state
    readonly property bool saved: frameState === "saved"
    readonly property string extension: format === "jpeg" ? ".jpg" : ".png"
    readonly property var generationHost: AiHostRegistry.revision >= 0 && gestures ? AiHostRegistry.host(gestures) : null
    readonly property bool canSave: frameState === "ready" && nameField.text.trim() !== ""

    function sourceHasFocus() {
        const viewer = Context.itemNamed(root.Window.window ? root.Window.window.contentItem : null, "sourceViewer")
        return !!viewer && viewer.sourceFocused === true
    }
    function suggestedName(base, stamp) {
        const name = base.trim() || "Frame"
        return stamp === "" ? name : name + " " + stamp.replace(/[:;]/g, "-")
    }
    // Escape in the field returns to `value`, so both move together.
    function setField(field, text) {
        field.value = text
        field.text = text
    }
    function explain(text) {
        reasonText.text = text
        reasonDialog.open()
        return true
    }
    // Called by the exportFrame action. An empty target follows keyboard focus.
    function openFor(requested, gestureController) {
        gestures = gestureController
        const source = requested === "source" || (requested !== "program" && sourceHasFocus())
        const fileOnly = !frameExporter.libraryAvailable
        destination = fileOnly ? "file" : destination
        setField(folderField, frameExporter.lastFolder)
        replaceTarget = ""
        if (source) {
            const monitor = SourceViewerState.monitor
            if (!monitor.hasVideo)
                return explain("Open a video in Source to export one of its frames.")
            if (!monitor.ready)
                return explain("Wait for Source to finish loading the video.")
            monitor.pause()
            const time = monitor.clock.time
            const stamp = TimelineFormat.timecode(time, monitor.frameRate, false)
            const asset = SourceViewerState.asset
            target = "source"
            detail = "Source at " + stamp
            setField(nameField, suggestedName(String(asset.name || "").replace(/\.[^.]*$/, ""), stamp))
            frameExporter.captureSource(asset, monitor.mediaPath, time)
        } else {
            if (!timelineModel || !gestures || !gestures.clock)
                return explain("Open a timeline to export a frame.")
            if (timelineModel.contentEndMs <= 0)
                return explain("Add a clip to the timeline to export a frame.")
            if (gestures.clock.playing)
                gestures.clock.pause()
            const time = gestures.clock.time
            const stamp = TimelineFormat.timecode(time, timelineModel.fps, timelineModel.dropFrame)
            target = "program"
            detail = "Program at " + stamp
            setField(nameField, suggestedName(timelineModel.name, stamp))
            frameExporter.captureProgram(time)
        }
        dialog.open()
        return true
    }
    function save() {
        if (!canSave)
            return
        const name = nameField.text.trim()
        if (destination === "library") {
            const browser = SourceViewerState.mediaBrowser
            frameExporter.saveToLibrary(name, format, browser ? browser.folderId : "")
            return
        }
        const url = frameExporter.fileUrl(folderField.text.trim(), name, format)
        if (replaceTarget !== url.toString() && frameExporter.fileExists(url)) {
            replaceTarget = url.toString()
            return
        }
        frameExporter.saveToFile(url, format)
    }
    function closeDialog() {
        dialog.close()
        frameExporter.reset()
    }
    // The start frame: a still at the end of the sequence, selected, with the Inspector's image to video open.
    function useAsStartFrame() {
        const payload = frameExporter.startFramePlacement()
        if (!gestures || !payload.asset || !stillBrowser.placeSource(payload)) {
            routeError.text = "Unlock a video track to place this frame."
            return
        }
        gestures.selection = [payload.videoClipId]
        gestures.clock.seek(payload.startMs)
        const view = gestures.viewState
        if (view)
            view.scrollLeftPx = Math.max(0, payload.startMs / view.msPerPx - view.viewportWidthPx / 4)
        closeDialog()
        gestures.runAction("panelAi")
    }
    function useAsReference() {
        const assetId = frameExporter.savedAsset.id
        const host = generationHost
        closeDialog()
        if (host)
            host.openWithReference(assetId)
    }

    FrameExporter {
        id: frameExporter
        objectName: "frameExporter"
        timeline: root.timelineModel
        onSaved: {
            if (root.destination === "library" && SourceViewerState.mediaBrowser)
                SourceViewerState.mediaBrowser.refresh()
        }
    }
    AssetBrowser {
        id: stillBrowser
        timeline: root.timelineModel
    }
    FolderDialog {
        id: folderDialog
        objectName: "exportFrameFolderDialog"
        title: "Choose a folder"
        onAccepted: {
            root.replaceTarget = ""
            root.setField(folderField, frameExporter.localPath(selectedFolder))
        }
    }

    Ui.Dialog {
        id: dialog
        objectName: "exportFrameDialog"
        title: "Export frame"
        width: Math.min(Math.max(root.width - 2 * Ui.Metrics.dialogNarrowInset, 0), Ui.Metrics.dialogWidth)
        height: Math.min(implicitHeight, Math.max(root.height - 2 * Ui.Metrics.dialogNarrowInset, 0))
        closePolicy: Popup.CloseOnEscape
        onClosed: frameExporter.reset()

        contentItem: ScrollView {
            id: scroller
            contentWidth: availableWidth
            ColumnLayout {
                width: scroller.availableWidth
                spacing: Ui.Metrics.lg
                Rectangle {
                    objectName: "exportFramePreview"
                    Layout.fillWidth: true
                    Layout.preferredHeight: Ui.Metrics.dialogCompactWidth / 2
                    color: Ui.Theme.surfaceCanvas
                    radius: Ui.Metrics.radiusCard
                    clip: true
                    FrameImage {
                        objectName: "exportFrameImage"
                        anchors.fill: parent
                        image: frameExporter.image
                    }
                    Ui.Text {
                        anchors.centerIn: parent
                        visible: root.frameState === "capturing"
                        text: "Rendering the frame at full resolution…"
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                }
                Ui.Text {
                    objectName: "exportFrameDetail"
                    Layout.fillWidth: true
                    text: root.detail + (frameExporter.frameSize.width > 0 ? ", " + frameExporter.frameSize.width + "x" + frameExporter.frameSize.height : "")
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    elide: Text.ElideRight
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    visible: !root.saved
                    spacing: Ui.Metrics.lg
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.micro
                        Ui.Text { text: "Name"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                        Ui.TextField {
                            id: nameField
                            objectName: "exportFrameName"
                            Layout.fillWidth: true
                            accessibleName: "Frame name"
                            onTextEdited: root.replaceTarget = ""
                            onAccepted: root.save()
                        }
                    }
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.lg
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.micro
                            Ui.Text { text: "Format"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                            Ui.Select {
                                objectName: "exportFrameFormat"
                                Layout.fillWidth: true
                                accessibleName: "Format"
                                options: [{label: "PNG", value: "png"}, {label: "JPEG", value: "jpeg"}]
                                value: root.format
                                onValueCommitted: next => { root.format = next; root.replaceTarget = "" }
                            }
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.micro
                            Ui.Text { text: "Save to"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                            Ui.Select {
                                objectName: "exportFrameDestination"
                                Layout.fillWidth: true
                                accessibleName: "Save to"
                                options: frameExporter.libraryAvailable
                                    ? [{label: "Library", value: "library"}, {label: "File", value: "file"}]
                                    : [{label: "File", value: "file"}]
                                value: root.destination
                                onValueCommitted: next => { root.destination = next; root.replaceTarget = "" }
                            }
                        }
                    }
                    Ui.Text {
                        objectName: "exportFrameNoLibrary"
                        Layout.fillWidth: true
                        visible: !frameExporter.libraryAvailable
                        text: "This timeline is not on a server, so the frame can only go to a file."
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        wrapMode: Text.Wrap
                    }
                    ColumnLayout {
                        Layout.fillWidth: true
                        visible: root.destination === "file"
                        spacing: Ui.Metrics.micro
                        Ui.Text { text: "Folder"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.md
                            Ui.TextField {
                                id: folderField
                                objectName: "exportFrameFolder"
                                Layout.fillWidth: true
                                accessibleName: "Folder"
                                onTextEdited: root.replaceTarget = ""
                                onAccepted: root.save()
                            }
                            Ui.EditorButton {
                                objectName: "exportFrameBrowse"
                                text: "Browse…"
                                onClicked: {
                                    folderDialog.currentFolder = frameExporter.folderUrl(folderField.text)
                                    folderDialog.open()
                                }
                            }
                        }
                    }
                    Ui.Banner {
                        objectName: "exportFrameReplace"
                        Layout.fillWidth: true
                        visible: root.replaceTarget !== ""
                        status: Ui.Status.Warning
                        message: "A file with this name already exists. Save again to replace it."
                    }
                }
                ColumnLayout {
                    objectName: "exportFrameResult"
                    Layout.fillWidth: true
                    visible: root.saved
                    spacing: Ui.Metrics.md
                    Ui.Text {
                        objectName: "exportFrameSavedText"
                        Layout.fillWidth: true
                        text: root.destination === "library"
                            ? "Saved to the Library as " + (frameExporter.savedAsset.name || nameField.text.trim() + root.extension) + "."
                            : "Saved to " + frameExporter.savedPath
                        role: Ui.Typography.SansBody
                        wrapMode: Text.Wrap
                    }
                    Ui.Text {
                        Layout.fillWidth: true
                        visible: root.destination === "library"
                        text: "Generate a new shot from this frame. The start frame goes at the end of the sequence and the AI panel opens on image to video. A reference opens Generate with the frame attached."
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        wrapMode: Text.Wrap
                    }
                    RowLayout {
                        Layout.fillWidth: true
                        visible: root.destination === "library"
                        spacing: Ui.Metrics.md
                        Ui.EditorButton {
                            objectName: "exportFrameUseStart"
                            text: "Use as start frame"
                            enabled: !!root.generationHost
                            onClicked: root.useAsStartFrame()
                        }
                        Ui.EditorButton {
                            objectName: "exportFrameUseReference"
                            text: "Use as reference"
                            enabled: !!root.generationHost
                            onClicked: root.useAsReference()
                        }
                    }
                    Ui.Text {
                        id: routeError
                        objectName: "exportFrameRouteError"
                        Layout.fillWidth: true
                        visible: text !== ""
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Error
                        wrapMode: Text.Wrap
                    }
                }
                Ui.Text {
                    objectName: "exportFrameError"
                    Layout.fillWidth: true
                    visible: frameExporter.error !== ""
                    text: frameExporter.error
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Error
                    wrapMode: Text.Wrap
                }
            }
        }
        footer: Row {
            spacing: Ui.Metrics.md
            padding: Ui.Metrics.lg
            layoutDirection: Qt.RightToLeft
            Ui.EditorButton {
                objectName: "exportFrameSave"
                visible: !root.saved
                text: root.frameState === "saving" ? "Saving…" : root.replaceTarget !== "" ? "Replace" : "Save"
                variant: Ui.EditorButton.Primary
                enabled: root.canSave
                onClicked: root.save()
            }
            Ui.EditorButton {
                objectName: "exportFrameCancel"
                text: root.saved ? "Done" : "Cancel"
                variant: root.saved ? Ui.EditorButton.Primary : Ui.EditorButton.Default
                onClicked: root.closeDialog()
            }
        }
    }

    Ui.Dialog {
        id: reasonDialog
        objectName: "exportFrameReasonDialog"
        title: "Export frame"
        width: Math.min(Math.max(root.width - 2 * Ui.Metrics.dialogNarrowInset, 0), Ui.Metrics.dialogCompactWidth)
        contentItem: Ui.Text {
            id: reasonText
            objectName: "exportFrameReason"
            wrapMode: Text.Wrap
            role: Ui.Typography.SansBody
        }
        footer: Row {
            spacing: Ui.Metrics.md
            padding: Ui.Metrics.lg
            layoutDirection: Qt.RightToLeft
            Ui.EditorButton {
                objectName: "exportFrameReasonClose"
                text: "Close"
                variant: Ui.EditorButton.Primary
                onClicked: reasonDialog.close()
            }
        }
    }
}
