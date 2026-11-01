// One fade ramp of ClipBody (clipFadeGeometry.ts `rampPath`): the curve from
// silence to full volume across the fade, with the area above it shaded.
// A fade-out reads the same curve backwards.
import QtQuick
import QtQuick.Shapes
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Shape {
    id: ramp
    property string edge: "in"
    property string shape: "linear"

    // audioFade.ts fadeShapeGain
    function gain(t) {
        const x = Math.max(0, Math.min(1, t))
        switch (shape) {
        case "sCurve": return (1 - Math.cos(x * Math.PI)) / 2
        case "plus3dB": return Math.sin(x * Math.PI / 2)
        case "minus3dB": return 2 / Math.PI * Math.asin(x)
        default: return x
        }
    }
    readonly property string rampPath: {
        const samples = shape === "linear" ? 1 : 24       // CURVE_SAMPLES
        let d = ""
        for (let i = 0; i <= samples; ++i) {
            const x = i / samples
            const g = gain(edge === "in" ? x : 1 - x)
            d += (i === 0 ? "M" : " L") + (x * width) + " " + ((1 - g) * height)
        }
        return d
    }

    preferredRendererType: Shape.CurveRenderer
    ShapePath {
        fillColor: Qt.rgba(Ui.Theme.textPrimary.r, Ui.Theme.textPrimary.g, Ui.Theme.textPrimary.b, 0.25)
        strokeWidth: -1
        PathSvg { path: ramp.rampPath + " L" + ramp.width + " 0 L0 0 Z" }
    }
    ShapePath {
        fillColor: "transparent"
        strokeColor: Ui.Theme.textPrimary
        strokeWidth: 1
        PathSvg { path: ramp.rampPath }
    }
}
