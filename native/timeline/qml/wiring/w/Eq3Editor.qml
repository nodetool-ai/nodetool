import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
EffectEditor {
    id: editor
    spacing: Theme.spacingMd
    Eq3Curve {
        width: parent.width
        effect: editor.effect
        disabled: editor.disabled
        onPreview: patch => editor.preview(patch)
        onCommit: patch => editor.commit(patch)
    }
    Row {
        width: parent.width
        spacing: Theme.spacingXs
        Repeater {
            model: ["low", "mid", "high"]
            delegate: Rectangle {
                id: tile
                required property string modelData
                required property int index
                width: (parent.width - 2 * Theme.spacingXs) / 3
                height: 52
                color: Theme.backgroundPaper
                radius: Theme.radiusXs
                border.width: 1; border.color: Theme.divider
                Rectangle { width: parent.width; height: 2; color: [Theme.info,Theme.success,Theme.warning][tile.index] }
                Column {
                    x: Theme.spacingMd; y: Theme.spacingXs
                    width: parent.width - 2 * Theme.spacingMd
                    spacing: Theme.spacingMicro
                    Item {
                        width: parent.width; height: 12
                        Text {
                            anchors.left: parent.left
                            text: [TrackEffectsReference.data.strings.eq.lowShelf, TrackEffectsReference.data.strings.eq.midPeak, TrackEffectsReference.data.strings.eq.highShelf][tile.index]
                            color: Theme.textSecondary; font.pixelSize: Theme.fontSizeSmaller; font.family: Theme.sansFamily
                        }
                        Text {
                            anchors.right: parent.right
                            text: (editor.effect[tile.modelData + "GainDb"] >= 0 ? "+" : "") + editor.effect[tile.modelData + "GainDb"].toFixed(1) + " dB"
                            color: Theme.textPrimary; font.pixelSize: Theme.fontSizeSmaller; font.family: Theme.sansFamily; font.weight: Font.Medium
                        }
                    }
                    Item {
                        width: parent.width; height: 12
                        Text { text: TrackEffectsReference.data.strings.frequencyShort; color: Theme.textSecondary; font.pixelSize: Theme.fontSizeSmaller; font.family: Theme.sansFamily }
                        Text {
                            anchors.right: parent.right
                            readonly property real hz: editor.effect[tile.modelData + "Freq"]
                            text: hz >= 1000 ? (hz / 1000).toFixed(hz >= 10000 ? 1 : 2) + " kHz" : Math.round(hz) + " Hz"
                            color: Theme.textPrimary; font.pixelSize: Theme.fontSizeSmaller; font.family: Theme.sansFamily; font.weight: Font.Medium
                        }
                    }
                    Item {
                        visible: tile.index === 1
                        width: parent.width; height: 12
                        Text { text: TrackEffectsReference.data.strings.q; color: Theme.textSecondary; font.pixelSize: Theme.fontSizeSmaller; font.family: Theme.sansFamily }
                        Text {
                            anchors.right: parent.right
                            text: Number(editor.effect.midQ).toFixed(2)
                            color: Theme.textPrimary; font.pixelSize: Theme.fontSizeSmaller; font.family: Theme.sansFamily; font.weight: Font.Medium
                        }
                    }
                }
            }
        }
    }
    Text {
        text: TrackEffectsReference.data.strings.eq.curveHint
        color: Theme.textSecondary; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmaller
        ToolTip.visible: hintHover.hovered; ToolTip.delay: 500; ToolTip.text: TrackEffectsReference.data.strings.eq.curveHelp
        HoverHandler { id: hintHover }
    }
}
