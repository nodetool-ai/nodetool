import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

// A clipped scrolling view. Content is as wide as the view unless the caller sets contentWidth.
Basic.ScrollView {
    clip: true
    contentWidth: availableWidth
    Basic.ScrollBar.vertical: Ui.ScrollBar {}
    Basic.ScrollBar.horizontal: Ui.ScrollBar {}
}
