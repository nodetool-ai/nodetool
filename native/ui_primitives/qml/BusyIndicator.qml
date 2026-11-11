import QtQuick
import QtQuick.Window
import QtQuick.Shapes
import NodeTool.UiPrimitives as Ui
Item {
    id: root
    property int tone: Ui.Text.Info
    readonly property color ink: tone === Ui.Text.OnAccent ? Theme.textOnAccent : tone === Ui.Text.Primary ? Theme.textPrimary : Theme.accentPrimary
    property bool running: true
    property string accessibleName: qsTr("Loading")
    readonly property bool animating: running && visible && !Theme.reducedMotion && Window.window !== null && Window.window.active
    implicitWidth: Metrics.iconLg
    implicitHeight: Metrics.iconLg
    Accessible.role: Accessible.Indicator
    Accessible.name: accessibleName
    Shape {
        anchors.fill: parent
        visible: root.running
        rotation: 0
        ShapePath {
            fillRule: ShapePath.OddEvenFill
            strokeWidth: 0
            fillGradient: ConicalGradient {
                centerX: root.width / 2; centerY: root.height / 2
                GradientStop { position: 0; color: root.ink }
                GradientStop { position: 1; color: Theme.actionHover }
            }
            PathAngleArc { centerX: root.width / 2; centerY: root.height / 2; radiusX: root.width / 2; radiusY: root.height / 2; startAngle: 0; sweepAngle: 360; moveToStart: true }
            PathAngleArc { centerX: root.width / 2; centerY: root.height / 2; radiusX: Math.max(0, root.width / 2 - Metrics.micro); radiusY: Math.max(0, root.height / 2 - Metrics.micro); startAngle: 0; sweepAngle: 360; moveToStart: true }
        }
        RotationAnimation on rotation { from: 0; to: 360; duration: Metrics.motionSpin; loops: Animation.Infinite; running: root.animating }
    }
}
