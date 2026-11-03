pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

// One scope: a dark plate as media has, in both schemes, its scale, and the trace image.
Rectangle {
    id: root
    objectName: "scopeTile_" + kind
    property string kind: ""
    required property var controller
    readonly property var image: kind === "waveform" ? controller.waveform : kind === "parade" ? controller.parade : kind === "vectorscope" ? controller.vectorscope : controller.histogram
    readonly property bool square: kind === "vectorscope"
    color: controller.plateColor
    clip: true
    Accessible.role: Accessible.Graphic
    Accessible.name: kind
    Canvas {
        id: scale
        anchors.fill: parent
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            const context = getContext("2d");
            context.reset();
            context.strokeStyle = root.controller.scaleColor;
            context.fillStyle = root.controller.scaleColor;
            context.lineWidth = 1;
            if (root.kind === "vectorscope") {
                const side = Math.min(width, height);
                const center = {x: width / 2, y: height / 2};
                const extent = root.controller.vectorExtent;
                context.beginPath();
                context.arc(center.x, center.y, side / 2 * (0.5 / extent), 0, Math.PI * 2);
                context.moveTo(center.x - side / 2, center.y);
                context.lineTo(center.x + side / 2, center.y);
                context.moveTo(center.x, center.y - side / 2);
                context.lineTo(center.x, center.y + side / 2);
                context.stroke();
                context.beginPath();
                const skin = root.controller.skinToneDeg * Math.PI / 180;
                context.moveTo(center.x, center.y);
                context.lineTo(center.x + side / 2 * Math.cos(skin), center.y - side / 2 * Math.sin(skin));
                context.strokeStyle = root.controller.skinLineColor;
                context.stroke();
                context.strokeStyle = root.controller.scaleColor;
                for (const target of root.controller.vectorTargets) {
                    const x = center.x + (target.x - 0.5) * side;
                    const y = center.y + (target.y - 0.5) * side;
                    context.strokeRect(x - 4, y - 4, 8, 8);
                }
                return;
            }
            for (let level = 0; level <= 100; level += 25) {
                context.beginPath();
                if (root.kind === "histogram") {
                    const x = Math.round(level / 100 * (width - 1)) + 0.5;
                    context.moveTo(x, 0);
                    context.lineTo(x, height);
                } else {
                    const y = Math.round((1 - level / 100) * (height - 1)) + 0.5;
                    context.moveTo(0, y);
                    context.lineTo(width, y);
                }
                context.stroke();
            }
        }
        Connections {
            target: root.controller
            function onInputsChanged() { scale.requestPaint() }
        }
    }
    FrameImage {
        objectName: "scopeImage_" + root.kind
        anchors.fill: parent
        image: root.image
        stretch: !root.square
    }
    // The level scale of the two waveforms, in percent of full scale.
    Repeater {
        model: root.kind === "waveform" || root.kind === "parade" ? [100, 75, 50, 25] : []
        delegate: Ui.Text {
            required property int modelData
            anchors.right: parent.right
            anchors.rightMargin: Ui.Metrics.xs
            y: (1 - modelData / 100) * (root.height - 1) + Ui.Metrics.micro
            text: String(modelData)
            role: Ui.Typography.SansCaption
            domainColor: root.controller.labelColor
        }
    }
    Repeater {
        model: root.kind === "vectorscope" ? root.controller.vectorTargets : []
        delegate: Ui.Text {
            required property var modelData
            readonly property real side: Math.min(root.width, root.height)
            x: root.width / 2 + (modelData.x - 0.5) * side - width / 2
            y: root.height / 2 + (modelData.y - 0.5) * side - height - Ui.Metrics.sm
            text: modelData.name
            role: Ui.Typography.SansCaption
            domainColor: root.controller.labelColor
        }
    }
    Ui.Text {
        x: Ui.Metrics.xs
        y: Ui.Metrics.micro
        text: root.kind === "waveform" ? "Luma" : root.kind === "parade" ? "RGB" : ""
        visible: text !== ""
        role: Ui.Typography.SansCaption
        domainColor: root.controller.labelColor
    }
}
