.pragma library
// The extent of each marker block in the Marker lane. A block starts at its
// marker. It ends at time + durationMs when durationMs > 0, else at the next
// marker's time, else at the sequence end. Blocks come in time order.

function extents(markers, sequenceEndMs) {
    const sorted = (markers || []).slice().sort((a, b) => a.timeMs - b.timeMs)
    return sorted.map((marker, index) => {
        const start = marker.timeMs
        const next = index + 1 < sorted.length ? sorted[index + 1].timeMs : sequenceEndMs
        const end = marker.durationMs > 0 ? start + marker.durationMs : next
        return {
            id: marker.id,
            startMs: start,
            endMs: Math.max(start, end),
            label: marker.label ? marker.label : "Marker",
            color: marker.color ? marker.color : ""
        }
    })
}
