pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// Closable tabs for open documents in a horizontally scrolling strip, after the
// web DockTabStrip. The caller owns `currentIndex` and the tab order, and acts on
// the signals. The strip draws no background of its own beyond the tabs.
Item {
    id: root
    // Entries: {title, closable?, renamable?, busy?, modified?, accent?}.
    property var tabs: []
    property int currentIndex: -1
    property string accessibleName: ""
    // The index whose title is being edited, or -1.
    property int renamingIndex: -1
    property bool reorderable: false
    property real minTabWidth: 0
    property real maxTabWidth: Number.POSITIVE_INFINITY
    property real tabPadding: Ui.Metrics.lg
    property real closablePadding: tabPadding
    property real plainPadding: tabPadding
    property real contentSpacing: Ui.Metrics.sm
    // How much shorter than the strip an unchosen tab is, measured from the bottom.
    property real unchosenInset: 0
    property int indicatorEdge: Qt.BottomEdge
    property color selectedColor: Ui.Theme.surfacePanel
    property color hoverColor: Ui.Theme.actionHover
    property color dividerColor: Ui.Theme.borderSubtle
    property color indicatorColor: Ui.Theme.accentPrimary
    // Delay before a cut-off title shows its full text.
    property int titleTooltipDelay: Ui.Metrics.tooltipDelay
    property real closeIconSize: Ui.Metrics.iconXs
    property int closeIdleTone: Ui.Text.Disabled
    property string busyLabel: qsTr("Busy")
    property string modifiedLabel: qsTr("Unsaved changes")
    property string renameLabel: qsTr("Tab name")
    // Where the strip scrolls to when it is laid out again. Negative keeps the current offset.
    property real scrollOffset: -1
    // Hosts name the parts for their tests: role is tab, activate, close, title, busy, modified or drop.
    property var objectNameFor: function (role, index) { return role + "-" + index }
    // Hosts add state to a tab's spoken name, such as running or unsaved.
    property var accessibleNameFor: function (tab) { return tab.title }
    property alias contentX: strip.contentX
    property alias contentWidth: strip.contentWidth
    property int dragFrom: -1
    property int dropTarget: -1
    property bool dropAfter: false
    signal tabActivated(int index)
    signal closeRequested(int index)
    // The point is in global coordinates, for the host's menu.
    signal contextMenuRequested(int index, point globalPosition)
    signal renameRequested(int index)
    signal renameCommitted(int index, string title)
    signal tabMoved(int from, int to, bool after)
    signal scrolled(real offset)

    implicitWidth: tabRow.implicitWidth
    implicitHeight: Ui.Metrics.compact
    clip: true
    Accessible.role: Accessible.PageTabList
    Accessible.name: accessibleName

    // A drop lands only on a tab, as the web drop handler does.
    function updateDrop(x, y) {
        const item = y >= 0 && y <= tabRow.height ? tabRow.childAt(x, tabRow.height / 2) : null
        if (!item || item.tabIndex === undefined) {
            dropTarget = -1
            return
        }
        dropTarget = item.tabIndex
        dropAfter = x >= item.x + item.width / 2
    }
    function finishDrop() {
        const source = dragFrom, target = dropTarget, after = dropAfter
        dragFrom = -1
        dropTarget = -1
        if (source >= 0 && target >= 0) tabMoved(source, target, after)
    }
    // Restores the scroll offset, then brings the current tab into view.
    function reveal() {
        const limit = Math.max(0, strip.contentWidth - strip.width)
        strip.contentX = Math.max(0, Math.min(scrollOffset >= 0 ? scrollOffset : strip.contentX, limit))
        const item = repeater.itemAt(currentIndex)
        if (!item) return
        if (item.x < strip.contentX) strip.contentX = item.x
        else if (item.x + item.width > strip.contentX + strip.width) strip.contentX = Math.min(limit, item.x + item.width - strip.width)
    }
    function focusTab(index) {
        const item = repeater.itemAt(index)
        if (item) item.forceActiveFocus()
    }
    onTabsChanged: Qt.callLater(reveal)
    onCurrentIndexChanged: Qt.callLater(reveal)
    onWidthChanged: Qt.callLater(reveal)
    Component.onCompleted: Qt.callLater(reveal)

    Flickable {
        id: strip
        anchors.fill: parent
        contentWidth: tabRow.implicitWidth
        contentHeight: height
        clip: true
        flickableDirection: Flickable.HorizontalFlick
        boundsBehavior: Flickable.StopAtBounds
        onContentXChanged: root.scrolled(contentX)
        Row {
            id: tabRow
            height: strip.height
            Repeater {
                id: repeater
                // Counting the tabs keeps each delegate alive while a tab's title or count changes.
                model: root.tabs.length
                delegate: Rectangle {
                    id: tab
                    required property int index
                    readonly property var entry: root.tabs[index] || ({})
                    readonly property int tabIndex: index
                    readonly property bool active: root.currentIndex === index
                    readonly property bool closable: entry.closable !== false
                    readonly property bool renaming: root.renamingIndex === index
                    objectName: root.objectNameFor("tab", index)
                    height: tabRow.height - (active ? 0 : root.unchosenInset)
                    width: Math.max(root.minTabWidth, Math.min(root.maxTabWidth, content.implicitWidth + root.tabPadding + (closable ? root.closablePadding : root.plainPadding)))
                    color: active ? root.selectedColor : hover.hovered ? root.hoverColor : "transparent"
                    activeFocusOnTab: true
                    Accessible.role: Accessible.PageTab
                    Accessible.name: root.accessibleNameFor(entry)
                    Accessible.checkable: true
                    Accessible.checked: active
                    Accessible.onPressAction: root.tabActivated(index)
                    Keys.onReturnPressed: root.tabActivated(index)
                    Keys.onSpacePressed: root.tabActivated(index)
                    Keys.onLeftPressed: root.focusTab(index - 1)
                    Keys.onRightPressed: root.focusTab(index + 1)
                    HoverHandler { id: hover }
                    MouseArea {
                        id: area
                        property point pressPoint
                        property bool dragging: false
                        objectName: root.objectNameFor("activate", tab.index)
                        anchors.fill: parent
                        acceptedButtons: Qt.LeftButton | Qt.MiddleButton | Qt.RightButton
                        preventStealing: true
                        onPressed: mouse => { pressPoint = Qt.point(mouse.x, mouse.y); dragging = false }
                        onPositionChanged: mouse => {
                            if (!root.reorderable || !(pressedButtons & Qt.LeftButton) || tab.renaming) return
                            if (!dragging && Math.abs(mouse.x - pressPoint.x) < Qt.styleHints.startDragDistance) return
                            dragging = true
                            root.dragFrom = tab.index
                            const position = mapToItem(tabRow, mouse.x, mouse.y)
                            root.updateDrop(position.x, position.y)
                        }
                        onReleased: mouse => {
                            if (mouse.button === Qt.LeftButton && dragging) {
                                const position = mapToItem(tabRow, mouse.x, mouse.y)
                                root.updateDrop(position.x, position.y)
                                root.finishDrop()
                            }
                        }
                        onCanceled: { dragging = false; root.dragFrom = -1; root.dropTarget = -1 }
                        onClicked: mouse => {
                            if (mouse.button === Qt.MiddleButton) {
                                if (tab.closable) root.closeRequested(tab.index)
                            } else if (mouse.button === Qt.RightButton) {
                                root.contextMenuRequested(tab.index, mapToGlobal(mouse.x, mouse.y))
                            } else if (!dragging) {
                                tab.forceActiveFocus()
                                root.tabActivated(tab.index)
                            }
                        }
                        onDoubleClicked: mouse => {
                            if (mouse.button === Qt.LeftButton && tab.entry.renamable) {
                                root.renamingIndex = tab.index
                                root.renameRequested(tab.index)
                            }
                        }
                    }
                    RowLayout {
                        id: content
                        anchors.left: parent.left
                        anchors.leftMargin: root.tabPadding
                        anchors.right: parent.right
                        anchors.rightMargin: tab.closable ? root.closablePadding : root.plainPadding
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: root.contentSpacing
                        Ui.BusyIndicator {
                            objectName: root.objectNameFor("busy", tab.index)
                            visible: tab.entry.busy === true && !tab.renaming
                            running: visible
                            implicitWidth: Ui.Metrics.iconXs
                            implicitHeight: Ui.Metrics.iconXs
                            tone: Ui.Text.Info
                            accessibleName: root.busyLabel
                        }
                        Ui.Text {
                            id: title
                            objectName: root.objectNameFor("title", tab.index)
                            visible: !tab.renaming
                            Layout.fillWidth: true
                            text: tab.entry.title
                            role: Ui.Typography.SansLabel
                            tone: tab.active || hover.hovered ? Ui.Text.Primary : Ui.Text.Secondary
                            elide: Text.ElideRight
                            HoverHandler { id: titleHover }
                            // Only a cut-off name needs its full text.
                            Ui.Tooltip {
                                trigger: title
                                delay: root.titleTooltipDelay
                                text: tab.entry.title
                                visible: titleHover.hovered && title.truncated
                            }
                        }
                        Ui.TextField {
                            objectName: root.objectNameFor("rename", tab.index)
                            visible: tab.renaming
                            Layout.fillWidth: true
                            density: Ui.EditorButton.Compact
                            accessibleName: root.renameLabel
                            value: tab.entry.title
                            onVisibleChanged: if (visible) { forceActiveFocus(); selectAll() }
                            onValueCommitted: value => { root.renamingIndex = -1; root.renameCommitted(tab.index, value) }
                            onEditCanceled: root.renamingIndex = -1
                            onAccepted: root.renamingIndex = -1
                            onActiveFocusChanged: if (!activeFocus && !editing) root.renamingIndex = -1
                            Keys.onEscapePressed: root.renamingIndex = -1
                        }
                        Rectangle {
                            objectName: root.objectNameFor("modified", tab.index)
                            visible: tab.entry.modified === true && !tab.renaming
                            implicitWidth: Ui.Metrics.md
                            implicitHeight: Ui.Metrics.md
                            radius: Ui.Metrics.radiusPill
                            color: Ui.Theme.statusWarning
                            Accessible.name: root.modifiedLabel
                        }
                        Ui.CloseButton {
                            objectName: root.objectNameFor("close", tab.index)
                            visible: tab.closable
                            iconSize: root.closeIconSize
                            iconTone: hovered ? Ui.Text.Primary : root.closeIdleTone
                            implicitWidth: Ui.Metrics.iconSm
                            implicitHeight: Ui.Metrics.iconSm
                            leftPadding: Ui.Metrics.none
                            rightPadding: Ui.Metrics.none
                            accessibleName: qsTr("Close %1").arg(tab.entry.title)
                            onClicked: root.closeRequested(tab.index)
                        }
                    }
                    Rectangle {
                        id: dropIndicator
                        objectName: root.objectNameFor("drop", tab.index)
                        visible: root.dragFrom >= 0 && root.dropTarget === tab.index
                        x: root.dropAfter ? parent.width - width : 0
                        width: Ui.Metrics.focus
                        height: parent.height
                        color: Ui.Theme.accentPrimary
                    }
                    Rectangle {
                        objectName: root.objectNameFor("indicator", tab.index)
                        anchors.top: root.indicatorEdge === Qt.TopEdge ? parent.top : undefined
                        anchors.bottom: root.indicatorEdge === Qt.BottomEdge ? parent.bottom : undefined
                        width: parent.width
                        height: Ui.Metrics.focus
                        visible: tab.active && !dropIndicator.visible
                        color: tab.entry.accent !== undefined ? tab.entry.accent : root.indicatorColor
                    }
                    Rectangle {
                        anchors.right: parent.right
                        width: Ui.Metrics.border
                        height: parent.height
                        color: root.dividerColor
                    }
                }
            }
        }
    }
}
