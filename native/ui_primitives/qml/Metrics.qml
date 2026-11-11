pragma Singleton
import QtQuick
QtObject {
    readonly property int motionQuick: 150
    readonly property int motionNormal: 200
    readonly property int motionSpin: 1000
    readonly property int tooltipDelay: 500
    readonly property int layerContent: 0
    readonly property int layerOverlay: 100
    readonly property real none: 0
    readonly property real micro: 2 * Theme.uiScale
    readonly property real xs: 4 * Theme.uiScale
    readonly property real sm: 6 * Theme.uiScale
    readonly property real md: 8 * Theme.uiScale
    readonly property real lg: 12 * Theme.uiScale
    readonly property real xl: 16 * Theme.uiScale
    readonly property real xxl: 24 * Theme.uiScale
    readonly property real xxxl: 32 * Theme.uiScale
    readonly property real dialogWidth: 640 * Theme.uiScale
    readonly property real dialogCompactWidth: 444 * Theme.uiScale
    readonly property real dialogNarrowInset: 16 * Theme.uiScale
    readonly property real compact: 28 * Theme.uiScale
    readonly property real standard: 32 * Theme.uiScale
    readonly property real small: 24 * Theme.uiScale
    readonly property real comfortable: 36 * Theme.uiScale
    readonly property real touch: 44 * Theme.uiScale
    readonly property real iconXs: 14 * Theme.uiScale
    readonly property real iconSm: 16 * Theme.uiScale
    readonly property real iconMd: 18 * Theme.uiScale
    readonly property real iconLg: 20 * Theme.uiScale
    readonly property real border: Theme.uiScale
    readonly property real focus: 2 * Theme.uiScale
    readonly property real radiusControl: 6 * Theme.uiScale
    readonly property real radiusOverlay: 8 * Theme.uiScale
    readonly property real radiusCard: 8 * Theme.uiScale
    readonly property real radiusPill: 999 * Theme.uiScale
}
