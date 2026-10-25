// Mirrors web/src/components/timeline/Tracks/TimelineScrollbar.tsx: an
// always-visible horizontal scrollbar under the lanes. The thumb size is the
// visible fraction; a thumb drag or a trough click sets the lanes' scroll.
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: bar
    required property TimelineViewState viewState
    // Left inset so the bar lines up with the lanes (the header width).
    property double leftInsetPx: Theme.trackHeaderWidth

    // computeScrollThumb(totalWidth, viewport, scrollLeft, trackWidth = viewport)
    readonly property var thumb: viewState.scrollThumb(viewState.totalWidthPx, viewState.viewportWidthPx,
                                                       viewState.scrollLeftPx, viewState.viewportWidthPx)

    objectName: "timelineScrollbar"
    height: Theme.scrollbarHeight
    color: Theme.backgroundPaper

    Rectangle {
        width: parent.width
        height: 1
        color: Theme.divider
    }

    Item {
        id: trough
        objectName: "scrollbarTrough"
        x: bar.leftInsetPx
        width: Math.max(0, bar.width - bar.leftInsetPx - Theme.spacingSm)
        height: 8                               // TROUGH_HEIGHT_PX
        anchors.verticalCenter: parent.verticalCenter

        MouseArea {
            anchors.fill: parent
            onPressed: mouse => bar.viewState.scrollLeftPx = bar.viewState.troughClickScrollLeft(mouse.x, bar.viewState.viewportWidthPx)
        }

        Rectangle {
            id: thumbRect
            objectName: "scrollbarThumb"
            x: bar.thumb.thumbLeft
            width: bar.thumb.thumbWidth
            height: parent.height
            radius: Theme.radiusSm
            color: thumbArea.pressed && bar.thumb.scrollable ? Theme.textPrimary
                   : thumbArea.containsMouse && bar.thumb.scrollable ? Theme.textSecondary
                   : Theme.actionDisabled

            MouseArea {
                id: thumbArea
                anchors.fill: parent
                hoverEnabled: true
                preventStealing: true
                cursorShape: bar.thumb.scrollable ? (pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor) : Qt.ArrowCursor
                property double startSceneX: 0
                property double startScroll: 0
                onPressed: mouse => {
                    startSceneX = mapToItem(null, mouse.x, 0).x
                    startScroll = bar.viewState.scrollLeftPx
                }
                onPositionChanged: mouse => {
                    if (!pressed || !bar.thumb.scrollable) return
                    const delta = mapToItem(null, mouse.x, 0).x - startSceneX
                    bar.viewState.scrollLeftPx = bar.viewState.thumbDragScrollLeft(startScroll, delta, bar.viewState.viewportWidthPx)
                }
            }
        }
    }
}
