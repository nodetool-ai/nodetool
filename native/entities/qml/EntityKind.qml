pragma Singleton
import QtQuick

// The four entity kinds with the label and icon each one shows.
QtObject {
    readonly property var kinds: ["character", "location", "style", "prop"]
    readonly property var labels: ({ character: "Character", location: "Location", style: "Style", prop: "Prop" })
    readonly property var icons: ({ character: "personOutline", location: "placeOutlined", style: "paletteOutlined", prop: "categoryOutlined" })
    function label(kind) { return labels[kind] || "" }
    function icon(kind) { return icons[kind] || "categoryOutlined" }
    function displayName(entity) { return entity && entity.name ? entity.name : "Untitled" }
}
