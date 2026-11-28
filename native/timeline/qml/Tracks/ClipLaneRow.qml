// Typed adapter for a visible track row. Pooled lanes borrow it until the
// window model removes the row, then keep their delegates for the next row.
pragma ComponentBehavior: Bound
import QtQuick

Item {
    required property double rowTop
    required property double rowHeight
    required property double baseRowHeight
    required property string trackId
    required property string trackType
    required property bool trackVisible
    required property bool locked
    required property bool muted
    y: rowTop
    height: rowHeight
}
