.pragma library

// The four entity kinds with the label and icon each one shows.
const kinds = ["character", "location", "style", "prop"]
const labels = { character: "Character", location: "Location", style: "Style", prop: "Prop" }
const icons = { character: "personOutline", location: "placeOutlined", style: "paletteOutlined", prop: "categoryOutlined" }

function label(kind) { return labels[kind] || "" }
function icon(kind) { return icons[kind] || "categoryOutlined" }
function displayName(entity) { return entity && entity.name ? entity.name : "Untitled" }
