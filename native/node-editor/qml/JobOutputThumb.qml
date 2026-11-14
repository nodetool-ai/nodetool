import QtQuick

// A queue history row's image output (MediaThumbnail in JobItem.tsx).
// QueueOverlay.qml loads it by URL, so the overlay itself needs no media types.
MediaPreview {
    property string assetId: ""
    mediaKind: "image"
    locator: ({type: "image", asset_id: assetId, uri: "asset://" + assetId})
    showFilename: false
    showDownload: false
    fillPreview: true
}
