pragma Singleton
import QtQuick
import NodeTool.UiPrimitives as Ui

QtObject {
    readonly property real emptyIcon: 48 * Ui.Theme.uiScale
    readonly property real minimumContentWidth: 320 * Ui.Theme.uiScale
    readonly property real columnWidth: 800 * Ui.Theme.uiScale
    readonly property real sidebar: 240 * Ui.Theme.uiScale
    readonly property real narrow: 640 * Ui.Theme.uiScale
    readonly property real mentionMenu: 240 * Ui.Theme.uiScale
    // MediaChatComposer.tsx NARROW_CARD_WIDTH: below it the chips go icon-first.
    readonly property real narrowComposer: 520 * Ui.Theme.uiScale
    // tokens.ts EYEBROW letterSpacing, as a share of the font size.
    readonly property real eyebrowTracking: 0.06
    // usePromptHistory.ts maxEntries.
    readonly property int promptHistory: 50
    // MediaOutputGroup.tsx THUMBNAIL_SIZE: one image tile of a media grid.
    readonly property real mediaTile: 120 * Ui.Theme.uiScale
    // ChatThreadView.styles.ts TOOL_RAIL_WIDTH and TOOL_ROW_HEIGHT: the glyph
    // column of the tool-call timeline and the height of one of its rows.
    readonly property real toolRail: 20 * Ui.Theme.uiScale
    readonly property real toolRow: 22 * Ui.Theme.uiScale
    // useChatScrollAnchor.ts SCROLL_THRESHOLD: this close to the end, the
    // view follows new content again.
    readonly property real followThreshold: 50 * Ui.Theme.uiScale
    // useChatScrollAnchor.ts ESTIMATED_MESSAGE_HEIGHT: this close to the top,
    // the next earlier page loads.
    readonly property real loadEarlierThreshold: 200 * Ui.Theme.uiScale
}
