pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Column {
    id: root
    property bool cyclic: false
    property var hueCurve: undefined
    property var saturationCurve: undefined
    property var master: []
    property var r: undefined
    property var g: undefined
    property var b: undefined
    property bool disabled: false
    property string channel: cyclic ? "hueCurve" : "master"
    readonly property var channels: cyclic ? [{value: "hueCurve", label: "Hue → hue"}, {value: "saturationCurve", label: "Hue → saturation"}] : [
        {
            value: "master",
            label: "Master"
        },
        {
            value: "r",
            label: "Red"
        },
        {
            value: "g",
            label: "Green"
        },
        {
            value: "b",
            label: "Blue"
        }
    ]
    readonly property string channelLabel: channels.find(item => item.value === channel)?.label ?? channel
    readonly property color curveColor: channel === "r" ? Ui.Theme.statusError : channel === "g" ? Ui.Theme.statusSuccess : channel === "b" ? Ui.Theme.statusInfo : Ui.Theme.textPrimary
    readonly property var points: editablePoints(root[channel])
    property int dragIndex: -1
    property bool dragChanged: false
    property var draft: []
    signal patch(var change, string phase)
    signal gestureStarted
    signal gestureCancelled
    spacing: Ui.Metrics.md
    onPointsChanged: if (graph)
        graph.requestPaint()
    onCurveColorChanged: if (graph)
        graph.requestPaint()
    onDisabledChanged: if (disabled)
        cancelDrag()
    Component.onDestruction: if (dragIndex >= 0)
        gestureCancelled()
    function identity() {
        if (cyclic) return [{x: 0, y: 0.5}, {x: 1, y: 0.5}];
        return [
            {
                x: 0,
                y: 0
            },
            {
                x: 1,
                y: 1
            }
        ];
    }
    function clamp(value) {
        return Math.min(1, Math.max(0, value));
    }
    function editablePoints(source) {
        if (!source || source.length < (cyclic ? 1 : 2))
            return identity();
        const valid = source.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y)).map(point => ({
                    x: clamp(point.x),
                    y: clamp(point.y)
                }));
        if (!cyclic) return valid.length < 2 ? identity() : valid.sort((a, b) => a.x - b.x);
        if (!valid.length) return identity();
        const knots = new Map();
        for (const point of valid) {
            if (point.x === 1 && knots.has(0)) continue;
            knots.set(point.x === 1 ? 0 : point.x, point.y);
        }
        const normalized = Array.from(knots, ([x, y]) => ({x, y})).sort((a, b) => a.x - b.x);
        const middle = normalized.filter(point => point.x > 0);
        const first = normalized[0], last = normalized[normalized.length - 1];
        const red = first.x === 0 ? first.y
            : last.y + (first.y - last.y) * (1 - last.x) / (first.x + 1 - last.x);
        return [{x: 0, y: red}].concat(middle, [{x: 1, y: red}]);
    }
    function write(next, phase = "apply") {
        if (disabled)
            return;
        const change = {};
        change[channel] = next;
        patch(change, phase);
    }
    function movePoint(source, index, next) {
        if (cyclic && (index === 0 || index === source.length - 1)) {
            return source.map((point, i) => i === 0 || i === source.length - 1 ? {x: point.x, y: clamp(next.y)} : point);
        }
        const left = index === 0 ? 0 : source[index - 1].x;
        const right = index === source.length - 1 ? 1 : source[index + 1].x;
        const gap = Math.min(0.005, Math.max(0, (right - left) / 3));
        const lower = index === 0 ? 0 : left + gap;
        const upper = index === source.length - 1 ? 1 : right - gap;
        return source.map((point, i) => i === index ? {
                x: Math.min(upper, Math.max(lower, next.x)),
                y: clamp(next.y)
            } : point);
    }
    function addPoint(next) {
        if (disabled)
            return;
        const existing = points.findIndex(point => Math.abs(point.x - next.x) < 0.005);
        if (cyclic && (existing === 0 || existing === points.length - 1)) {
            write(movePoint(points, existing, next));
            return;
        }
        write(existing < 0 ? points.concat([next]).sort((a, b) => a.x - b.x) : points.map((point, i) => i === existing ? {
                x: point.x,
                y: next.y
            } : point));
    }
    function removePoint(index) {
        if (cyclic && (index === 0 || index === points.length - 1)) return;
        if (points.length > 2)
            write(points.filter((_, i) => i !== index));
    }
    function beginDrag(index) {
        if (disabled)
            return;
        dragIndex = index;
        dragChanged = false;
        draft = points;
        gestureStarted();
    }
    function dragPoint(next) {
        if (dragIndex < 0)
            return;
        draft = movePoint(draft, dragIndex, next);
        dragChanged = true;
        write(draft, "preview");
    }
    function finishDrag() {
        if (dragIndex < 0)
            return;
        if (dragChanged)
            write(draft, "commit");
        else
            gestureCancelled();
        dragIndex = -1;
    }
    function cancelDrag() {
        if (dragIndex < 0)
            return;
        dragIndex = -1;
        gestureCancelled();
    }
    Row {
        width: parent.width
        spacing: Ui.Metrics.md
        Row {
            width: parent.width - reset.width - Ui.Metrics.md
            Accessible.name: "Curve channel"
            Repeater {
                model: root.channels
                delegate: Ui.EditorButton {
                    required property var modelData
                    width: parent.width / root.channels.length
                    objectName: "toneCurveChannel_" + modelData.value
                    text: modelData.label
                    density: Ui.EditorButton.Compact
                    variant: Ui.EditorButton.Flat
                    enabled: !root.disabled
                    active: root.channel === modelData.value
                    onClicked: {
                        root.cancelDrag();
                        root.channel = modelData.value;
                    }
                }
            }
        }
        Ui.EditorButton {
            id: reset
            objectName: "toneCurveReset"
            text: "Reset"
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            enabled: !root.disabled
            onClicked: {
                root.cancelDrag();
                root.write(root.cyclic || root.channel === "master" ? root.identity() : undefined);
            }
        }
    }
    Connections { target: Ui.Theme; function onEffectiveSchemeChanged() { graph.requestPaint() } }
    Canvas {
        id: graph
        objectName: "toneCurveGraph"
        width: parent.width
        height: width
        Accessible.role: Accessible.Grouping
        Accessible.name: root.channelLabel + " tone curve"
        onWidthChanged: requestPaint()
        onPaint: {
            const ctx = getContext("2d");
            ctx.reset();
            ctx.fillStyle = Ui.Theme.surfacePanel;
            ctx.fillRect(0, 0, width, height);
            ctx.strokeStyle = Ui.Theme.borderSubtle;
            ctx.lineWidth = 1;
            ctx.strokeRect(0, 0, width, height);
            ctx.lineWidth = 0.5;
            for (const fraction of [0.25, 0.5, 0.75]) {
                ctx.beginPath();
                ctx.moveTo(width * fraction, 0);
                ctx.lineTo(width * fraction, height);
                ctx.moveTo(0, height * fraction);
                ctx.lineTo(width, height * fraction);
                ctx.stroke();
            }
            ctx.strokeStyle = Ui.Theme.textDisabled;
            ctx.lineWidth = 0.75;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(0, root.cyclic ? height / 2 : height);
            ctx.lineTo(width, root.cyclic ? height / 2 : 0);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = root.curveColor;
            ctx.lineWidth = 2;
            ctx.lineJoin = "round";
            ctx.beginPath();
            root.points.forEach((point, index) => {
                if (index === 0)
                    ctx.moveTo(point.x * width, (1 - point.y) * height);
                else
                    ctx.lineTo(point.x * width, (1 - point.y) * height);
            });
            ctx.stroke();
        }
        function eventPoint(item, x, y) {
            const position = item.mapToItem(graph, x, y);
            return {
                x: root.clamp(position.x / width),
                y: root.clamp(1 - position.y / height)
            };
        }
        MouseArea {
            anchors.fill: parent
            enabled: !root.disabled
            cursorShape: Qt.CrossCursor
            onPressed: mouse => root.addPoint(graph.eventPoint(this, mouse.x, mouse.y))
        }
        Repeater {
            model: root.points.length
            delegate: Rectangle {
                id: point
                required property int index
                objectName: "toneCurvePoint_" + index
                width: graph.width * 0.06
                height: width
                radius: width / 2
                x: root.points[index].x * graph.width - width / 2
                y: (1 - root.points[index].y) * graph.height - height / 2
                color: Ui.Theme.surfacePanel
                border.color: root.curveColor
                border.width: activeFocus ? Ui.Metrics.focus : Ui.Metrics.border
                activeFocusOnTab: true
                Accessible.role: Accessible.Button
                Accessible.name: root.channelLabel + " point " + (index + 1) + ", input " + root.points[index].x.toFixed(2) + ", output " + root.points[index].y.toFixed(2)
                Keys.onPressed: event => {
                    if (root.disabled)
                        return;
                    if (event.key === Qt.Key_Delete || event.key === Qt.Key_Backspace) {
                        root.removePoint(index);
                        event.accepted = true;
                        return;
                    }
                    const step = event.modifiers & Qt.ShiftModifier ? 0.05 : 0.01;
                    const current = root.points[index];
                    const dx = event.key === Qt.Key_Left ? -step : event.key === Qt.Key_Right ? step : 0;
                    const dy = event.key === Qt.Key_Up ? step : event.key === Qt.Key_Down ? -step : 0;
                    if (!dx && !dy)
                        return;
                    root.write(root.movePoint(root.points, index, {
                        x: root.clamp(current.x + dx),
                        y: root.clamp(current.y + dy)
                    }));
                    event.accepted = true;
                }
                MouseArea {
                    anchors.fill: parent
                    enabled: !root.disabled
                    preventStealing: true
                    cursorShape: pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor
                    onPressed: {
                        point.forceActiveFocus();
                        root.beginDrag(point.index);
                    }
                    onPositionChanged: mouse => {
                        if (pressed)
                            root.dragPoint(graph.eventPoint(this, mouse.x, mouse.y));
                    }
                    onReleased: root.finishDrag()
                    onCanceled: root.cancelDrag()
                    onDoubleClicked: {
                        root.cancelDrag();
                        root.removePoint(point.index);
                    }
                }
            }
        }
    }
    Ui.Text {
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Secondary
        wrapMode: Text.WordWrap
        width: parent.width
        text: (root.cyclic ? "Input: red, yellow, green, cyan, blue, magenta, red. Red endpoints move together. " + (root.channel === "hueCurve" ? "Output: -180° at bottom, 0° at center, +180° at top. " : "Output: 0× at bottom, 1× at center, 2× at top. ") : "") + "Click to add a point. Drag points to shape the curve. Double-click an interior point or press Delete to remove it."
    }
}
