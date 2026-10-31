import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
EffectEditor {
    id: editor
    spacing: Ui.Metrics.md
    Eq3Curve {
        width: parent.width
        effect: editor.effect
        disabled: editor.disabled
        onPreview: patch => editor.preview(patch)
        onCommit: patch => editor.commit(patch)
            onEditCanceled: editor.editCanceled()
    }
    Row {
        width: parent.width
        spacing: Ui.Metrics.xs
        Repeater {
            model: ["low", "mid", "high"]
            delegate: Rectangle {
                id: tile
                required property string modelData
                required property int index
                width: (parent.width - 2 * Ui.Metrics.xs) / 3
                height: Math.max(52, tileDetails.implicitHeight + Ui.Metrics.sm * 2)
                color: Ui.Theme.surfacePanel
                radius: Ui.Metrics.micro
                border.width: Ui.Metrics.border; border.color: Ui.Theme.borderSubtle
                Rectangle { width: parent.width; height: 2; color: [Ui.Theme.statusInfo,Ui.Theme.statusSuccess,Ui.Theme.statusWarning][tile.index] }
                Column {
                    id: tileDetails
                    x: Ui.Metrics.md; y: Ui.Metrics.xs
                    width: parent.width - 2 * Ui.Metrics.md
                    spacing: Ui.Metrics.micro
                    Item {
                        width: parent.width; height: Ui.Typography.pixelSize(Ui.Typography.SansLabel) * 1.35
                        Ui.Text {
                            anchors.left: parent.left
                            text: [TrackEffectsReference.data.strings.eq.lowShelf, TrackEffectsReference.data.strings.eq.midPeak, TrackEffectsReference.data.strings.eq.highShelf][tile.index]
                            tone: Ui.Text.Secondary; role: Ui.Typography.SansCaption
                        }
                        Ui.Text {
                            anchors.right: parent.right
                            text: (editor.effect[tile.modelData + "GainDb"] >= 0 ? "+" : "") + editor.effect[tile.modelData + "GainDb"].toFixed(1) + " dB"
                            tone: Ui.Text.Primary; role: Ui.Typography.SansLabel
                        }
                    }
                    Item {
                        width: parent.width; height: Ui.Typography.pixelSize(Ui.Typography.SansLabel) * 1.35
                        Ui.Text { text: TrackEffectsReference.data.strings.frequencyShort; tone: Ui.Text.Secondary; role: Ui.Typography.SansCaption }
                        Ui.Text {
                            anchors.right: parent.right
                            readonly property real hz: editor.effect[tile.modelData + "Freq"]
                            text: hz >= 1000 ? (hz / 1000).toFixed(hz >= 10000 ? 1 : 2) + " kHz" : Math.round(hz) + " Hz"
                            tone: Ui.Text.Primary; role: Ui.Typography.SansLabel
                        }
                    }
                    Item {
                        visible: tile.index === 1
                        width: parent.width; height: Ui.Typography.pixelSize(Ui.Typography.SansLabel) * 1.35
                        Ui.Text { text: TrackEffectsReference.data.strings.q; tone: Ui.Text.Secondary; role: Ui.Typography.SansCaption }
                        Ui.Text {
                            anchors.right: parent.right
                            text: Number(editor.effect.midQ).toFixed(2)
                            tone: Ui.Text.Primary; role: Ui.Typography.SansLabel
                        }
                    }
                }
            }
        }
    }
    Ui.Text {
        id: hint
        text: TrackEffectsReference.data.strings.eq.curveHint
        tone: Ui.Text.Secondary; role: Ui.Typography.SansCaption
        Ui.Tooltip { trigger: hint; visible: hintHover.hovered; text: TrackEffectsReference.data.strings.eq.curveHelp }
        HoverHandler { id: hintHover }
    }
}
