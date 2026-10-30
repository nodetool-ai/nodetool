import QtQuick
import QtQuick.Controls

Button {
    id: root
    property string glyph: ""
    property bool primary: false
    implicitWidth: glyph ? ChatTheme.xxxl : Math.max(ChatTheme.control, contentItem.implicitWidth + leftPadding + rightPadding)
    ToolTip.visible: hovered && glyph.length > 0
    ToolTip.text: text
    ToolTip.delay: 500
    font.family: ChatTheme.sans
    font.pixelSize: ChatTheme.label
    leftPadding: ChatTheme.lg
    rightPadding: ChatTheme.lg
    implicitHeight: glyph && !primary ? ChatTheme.xxl : ChatTheme.control
    Accessible.name: text
    contentItem: Item {
        implicitWidth: label.implicitWidth
        Text {
            id: label
            anchors.fill: parent
            visible: !root.glyph
            text: root.text
            color: root.enabled ? ChatTheme.text : ChatTheme.muted
            font: root.font
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }
        Canvas {
            id: iconCanvas
            anchors.centerIn: parent
            width: ChatTheme.xl
            height: ChatTheme.xl
            visible: root.glyph.length > 0
            property color ink: root.primary && root.enabled ? ChatTheme.text : ChatTheme.muted
            onInkChanged: requestPaint()
            Connections {
                target: root
                function onGlyphChanged() {
                    iconCanvas.requestPaint();
                }
            }
            onPaint: {
                const ctx = getContext("2d");
                ctx.reset();
                ctx.strokeStyle = ink;
                ctx.fillStyle = ink;
                ctx.lineWidth = 1.5;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                ctx.beginPath();
                if (root.glyph === "⧉") {
                    ctx.rect(5, 5, 9, 9);
                    ctx.moveTo(10, 5);
                    ctx.lineTo(10, 2);
                    ctx.lineTo(2, 2);
                    ctx.lineTo(2, 10);
                    ctx.lineTo(5, 10);
                } else if (root.glyph === "+") {
                    ctx.moveTo(8, 3);
                    ctx.lineTo(8, 13);
                    ctx.moveTo(3, 8);
                    ctx.lineTo(13, 8);
                } else if (root.glyph === "↑") {
                    ctx.moveTo(8, 13);
                    ctx.lineTo(8, 3);
                    ctx.moveTo(3, 8);
                    ctx.lineTo(8, 3);
                    ctx.lineTo(13, 8);
                } else if (root.glyph === "■") {
                    ctx.fillRect(4, 4, 8, 8);
                } else {
                    ctx.moveTo(2, 4);
                    ctx.lineTo(14, 4);
                    ctx.moveTo(2, 12);
                    ctx.lineTo(14, 12);
                    ctx.rect(5, 2, 3, 4);
                    ctx.rect(9, 10, 3, 4);
                }
                ctx.stroke();
            }
        }
    }
    background: Rectangle {
        color: root.primary ? (root.enabled ? ChatTheme.primary : ChatTheme.bubble) : root.down || root.hovered ? ChatTheme.selected : root.flat ? "transparent" : ChatTheme.paper
        radius: root.primary ? height / 2 : ChatTheme.radius
        border.color: root.activeFocus ? ChatTheme.primary : root.flat || root.primary ? "transparent" : ChatTheme.divider
        border.width: root.activeFocus ? 2 : 1
    }
}
