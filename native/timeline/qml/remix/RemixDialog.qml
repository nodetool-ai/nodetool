// The Remix dialog: target length, how many cuts and how far they may roam, the plan
// and an audition. Nothing reaches the document until Remix.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Dialog {
    id: dialog
    objectName: "remixDialog"
    required property RemixController controller
    readonly property bool refused: controller.state === "refused"
    readonly property bool working: controller.state === "analyzing" || controller.state === "applying" || controller.state === "rendering"
    readonly property bool targetValid: targetField.text.trim() !== "" && Number.isFinite(Number(targetField.text)) && Number(targetField.text) >= 1 && Number(targetField.text) <= 3600
    readonly property alias targetText: targetField
    readonly property alias segmentsSlider: segments
    readonly property alias variationsSlider: variations
    readonly property alias remixButton: remix
    readonly property alias listenButton: listen

    function clock(ms) {
        const total = Math.max(0, ms) / 1000
        const minutes = Math.floor(total / 60)
        const seconds = total - minutes * 60
        return minutes + ":" + (seconds < 10 ? "0" : "") + seconds.toFixed(2)
    }
    function plural(count, one, many) { return count + " " + (count === 1 ? one : many) }
    // What the sliders held when the last edit ended: Escape during a drag goes back to it.
    property real committedSegments: 50
    property real committedVariations: 50

    function openFor(clipId) {
        controller.begin(clipId)
        committedSegments = controller.segments
        committedVariations = controller.variations
        open()
    }
    // The settings the dialog shows, with any of them replaced by what a field is about to hold.
    function push(targetMs, segmentsValue, variationsValue) {
        controller.setSettings(targetMs ?? controller.targetMs, segmentsValue ?? controller.segments, variationsValue ?? controller.variations)
    }
    function commitTarget(text) {
        const seconds = Number(text)
        if (text.trim() !== "" && Number.isFinite(seconds) && seconds >= 1 && seconds <= 3600) push(Math.round(seconds * 1000))
    }

    title: "Remix"
    width: Math.min(Ui.Metrics.dialogWidth, parent ? parent.width - Ui.Metrics.xl * 2 : Ui.Metrics.dialogWidth)
    height: Math.min(implicitHeight, parent ? parent.height - Ui.Metrics.xl * 2 : implicitHeight)
    closePolicy: Popup.CloseOnEscape
    onClosed: controller.close()

    contentItem: Flickable {
        id: scroll
        implicitHeight: body.implicitHeight
        contentWidth: width
        contentHeight: body.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: Ui.ScrollBar {}
        ColumnLayout {
            id: body
            width: scroll.width - (scroll.height + 2 < body.implicitHeight ? Ui.Metrics.md : 0)
            spacing: Ui.Metrics.lg

            Ui.Text {
                objectName: "remixSummary"
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                role: Ui.Typography.SansLabel
                tone: Ui.Text.Secondary
                text: {
                    const name = dialog.controller.clipName || "This clip"
                    if (dialog.controller.state === "ready" || dialog.controller.state === "applying" || dialog.controller.state === "rendering") {
                        return name + ": " + dialog.clock(dialog.controller.sourceMs) + " of music, " +
                            Math.round(dialog.controller.bpm) + " beats per minute, " + dialog.plural(dialog.controller.beatCount, "beat", "beats") + " found."
                    }
                    return name
                }
            }

            ColumnLayout {
                Layout.fillWidth: true
                visible: dialog.working
                spacing: Ui.Metrics.xs
                Ui.Text {
                    objectName: "remixPhase"
                    Layout.fillWidth: true
                    role: Ui.Typography.SansBody
                    text: dialog.controller.phase
                }
                Ui.Progress {
                    objectName: "remixProgress"
                    Layout.fillWidth: true
                    from: 0
                    to: 1
                    value: dialog.controller.progress
                    accessibleName: dialog.controller.phase
                }
            }

            Ui.Banner {
                objectName: "remixRefusal"
                Layout.fillWidth: true
                visible: message !== ""
                status: dialog.refused ? Ui.Status.Error : Ui.Status.Warning
                message: dialog.controller.error !== "" ? dialog.controller.error
                       : dialog.refused ? dialog.controller.refusal
                       : dialog.controller.state === "ready" ? dialog.controller.refusal : ""
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: Ui.Metrics.lg
                visible: !dialog.refused
                enabled: dialog.controller.state === "ready"

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.xs
                    Ui.Text { text: "Target length"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.md
                        Ui.TextField {
                            id: targetField
                            objectName: "remixTarget"
                            Layout.preferredWidth: Ui.Metrics.xxxl * 4
                            accessibleName: "Target length in seconds"
                            suffix: "s"
                            selectByMouse: true
                            // The field shows what the plan uses. A cancelled or invalid edit goes back to it.
                            value: dialog.controller.state === "closed" ? "" : String(dialog.controller.targetMs / 1000)
                            valid: dialog.targetValid
                            errorText: "Enter a length from 1 to 3600 seconds."
                            onValueCommitted: text => dialog.commitTarget(text)
                        }
                        Ui.EditorButton {
                            objectName: "remixUseClipLength"
                            text: "Clip length " + dialog.clock(dialog.controller.currentMs)
                            density: Ui.EditorButton.Compact
                            onClicked: dialog.push(Math.round(dialog.controller.currentMs))
                        }
                        Ui.EditorButton {
                            objectName: "remixFitGap"
                            visible: dialog.controller.gapMs > 0
                            text: "Fit the gap " + dialog.clock(dialog.controller.gapMs)
                            density: Ui.EditorButton.Compact
                            onClicked: dialog.push(Math.round(dialog.controller.gapMs))
                        }
                    }
                }

                GridLayout {
                    Layout.fillWidth: true
                    columns: 2
                    columnSpacing: Ui.Metrics.lg
                    rowSpacing: Ui.Metrics.md
                    Ui.Text { text: "Segments"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.md
                        Ui.Text { text: "Fewer"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                        Ui.Slider {
                            id: segments
                            objectName: "remixSegments"
                            Layout.fillWidth: true
                            from: 0
                            to: 100
                            stepSize: 1
                            accessibleName: "Segments"
                            value: dialog.controller.segments
                            onValuePreviewed: v => dialog.push(undefined, v, undefined)
                            onValueCommitted: v => { dialog.committedSegments = v; dialog.push(undefined, v, undefined) }
                            onEditCanceled: dialog.push(undefined, dialog.committedSegments, undefined)
                        }
                        Ui.Text { text: "More"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                    }
                    Ui.Text { text: "Variations"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.md
                        Ui.Text { text: "Fewer"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                        Ui.Slider {
                            id: variations
                            objectName: "remixVariations"
                            Layout.fillWidth: true
                            from: 0
                            to: 100
                            stepSize: 1
                            accessibleName: "Variations"
                            value: dialog.controller.variations
                            onValuePreviewed: v => dialog.push(undefined, undefined, v)
                            onValueCommitted: v => { dialog.committedVariations = v; dialog.push(undefined, undefined, v) }
                            onEditCanceled: dialog.push(undefined, undefined, dialog.committedVariations)
                        }
                        Ui.Text { text: "More"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                    }
                }

                RemixPlanStrip {
                    objectName: "remixPlan"
                    Layout.fillWidth: true
                    visible: dialog.controller.hasPlan
                    pieces: dialog.controller.pieces
                }
                Ui.Text {
                    objectName: "remixResult"
                    Layout.fillWidth: true
                    visible: dialog.controller.hasPlan
                    wrapMode: Text.Wrap
                    role: Ui.Typography.SansLabel
                    text: {
                        const c = dialog.controller
                        const cuts = c.cutCount === 0 ? "The music is not cut." : "Cut " + dialog.plural(c.cutCount, "time", "times") + "."
                        const tempo = Math.abs(c.tempoChangePercent) < 0.05 ? "" :
                            " It plays " + Math.abs(c.tempoChangePercent).toFixed(1) + "% " + (c.tempoChangePercent < 0 ? "slower" : "faster") + " so it ends on the exact length."
                        return "Result " + dialog.clock(c.targetMs) + ". " + cuts + tempo
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: Ui.Metrics.md
                Item { Layout.fillWidth: true }
                Ui.EditorButton {
                    id: listen
                    objectName: "remixListen"
                    visible: !dialog.refused
                    text: dialog.controller.listening ? "Stop" : "Listen"
                    iconName: dialog.controller.listening ? "stop" : "playArrow"
                    enabled: dialog.controller.canListen
                    onClicked: dialog.controller.listen()
                }
                Ui.EditorButton {
                    objectName: "remixCancel"
                    text: dialog.refused ? "Close" : "Cancel"
                    onClicked: dialog.close()
                }
                Ui.EditorButton {
                    id: remix
                    objectName: "remixApply"
                    visible: !dialog.refused
                    text: "Remix"
                    variant: Ui.EditorButton.Primary
                    enabled: dialog.controller.canApply && dialog.targetValid
                    disabledReason: dialog.controller.refusal
                    onClicked: dialog.controller.apply()
                }
            }
        }
    }
}
