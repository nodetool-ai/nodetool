import QtQuick
import QtQuick.Effects
import NodeTool.Timeline
Rectangle {
    id: preview
    property var effect: ({})
    property bool disabled: false
    property bool vignette: false
    implicitHeight: width * 9 / 16
    height: implicitHeight
    radius: Theme.radiusSm
    border.width: 1; border.color: Theme.divider
    color: Theme.backgroundPaper
    clip: true
    opacity: disabled ? 0.4 : 1
    Canvas {
        anchors.fill: parent
        onPaint: {
            const ctx = getContext("2d")
            const gradient = ctx.createLinearGradient(0,0,width,height)
            gradient.addColorStop(0,Theme.backgroundPaper)
            gradient.addColorStop(0.35,TrackEffectsReference.data.palette.grey600)
            gradient.addColorStop(1,TrackEffectsReference.data.palette.grey400)
            ctx.fillStyle = gradient; ctx.fillRect(0,0,width,height)
        }
    }
    Canvas {
        id: image
        anchors.fill: parent
        layer.enabled: !preview.vignette
        layer.effect: MultiEffect {
            blurEnabled: true
            blurMax: 40
            blur: preview.effect.radius / 40
        }
        onPaint: {
            const ctx = getContext("2d")
            ctx.reset()
            if (preview.vignette) {
                ctx.save(); ctx.scale(width,height)
                const gradient = ctx.createRadialGradient(0.5,0.5,0,0.5,0.5,Math.SQRT1_2)
                const inner = Math.max(0,preview.effect.radius - preview.effect.softness)
                gradient.addColorStop(Math.min(1,inner),"transparent")
                gradient.addColorStop(Math.min(1,preview.effect.radius),Qt.rgba(0,0,0,preview.effect.intensity))
                ctx.fillStyle = gradient; ctx.fillRect(0,0,1,1); ctx.restore()
            } else {
                for (const spot of [[0.3,0.4,0.4,Theme.overlayStrong],[0.75,0.65,0.35,Qt.rgba(Theme.error.r,Theme.error.g,Theme.error.b,0.4)]]) {
                    const gradient = ctx.createRadialGradient(width*spot[0],height*spot[1],0,width*spot[0],height*spot[1],Math.sqrt(width*width+height*height)*spot[2])
                    gradient.addColorStop(0,spot[3]); gradient.addColorStop(1,"transparent")
                    ctx.fillStyle = gradient; ctx.fillRect(0,0,width,height)
                }
            }
        }
        Connections { target: preview; function onEffectChanged() { image.requestPaint() } }
    }
}
