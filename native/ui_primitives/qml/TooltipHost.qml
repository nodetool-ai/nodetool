pragma Singleton
import QtQuick

// How a host shows a tooltip that its overlay cannot hold, such as a panel hosted in a
// QQuickWidget sized to a toolbar. A host sets `native`, connects `requested`, and shows
// the text itself. An empty text hides it. Without a host, tooltips stay in the overlay.
QtObject {
    property bool native: false
    signal requested(string text)
}
