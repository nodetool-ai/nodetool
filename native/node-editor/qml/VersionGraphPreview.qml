import QtQuick
import NodeTool.UiPrimitives as Ui
Rectangle {
 id: root
 required property var graph
 color: Ui.Theme.surfaceInput
 border.color: Ui.Theme.borderSubtle
 border.width: Ui.Metrics.border
 clip: true
 Canvas {
  id: canvas
  anchors.fill: parent
  onWidthChanged: requestPaint()
  onHeightChanged: requestPaint()
  Connections { target: root; function onGraphChanged() { canvas.requestPaint() } }
  Connections { target: Ui.Theme; function onDarkChanged() { canvas.requestPaint() } }
  onPaint: {
   const c = getContext("2d"); c.reset()
   const nodes = root.graph.nodes || []; const edges = root.graph.edges || []
   if (!nodes.length) return
   const positions = {}; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
   const nw = Ui.Metrics.touch * 3, nh = Ui.Metrics.touch
   nodes.forEach((n, i) => {
    const p = (n.ui_properties || {}).position || n.position || {x: i * nw, y: 0}
    positions[n.id] = p; minX = Math.min(minX,p.x); minY = Math.min(minY,p.y); maxX = Math.max(maxX,p.x+nw); maxY = Math.max(maxY,p.y+nh)
   })
   const margin = Ui.Metrics.xl
   const scale = Math.min((width-margin*2)/(maxX-minX), (height-margin*2)/(maxY-minY))
   c.translate((width-(maxX-minX)*scale)/2,(height-(maxY-minY)*scale)/2); c.scale(scale,scale); c.translate(-minX,-minY)
   c.strokeStyle = Ui.Theme.textSecondary; c.lineWidth = Ui.Metrics.border / scale
   edges.forEach(e => { const a=positions[e.source], b=positions[e.target]; if(a && b) { c.beginPath(); c.moveTo(a.x+nw,a.y+nh/2); c.lineTo(b.x,b.y+nh/2); c.stroke() } })
   c.font = Ui.Typography.pixelSize(Ui.Typography.SansCaption) + "px " + Ui.Typography.family(Ui.Typography.SansCaption)
   nodes.forEach(n => { const p=positions[n.id]; c.fillStyle=Ui.Theme.surfacePanel; c.fillRect(p.x,p.y,nw,nh); c.strokeRect(p.x,p.y,nw,nh); c.fillStyle=Ui.Theme.textPrimary; c.fillText(n.type || n.id,p.x+Ui.Metrics.md,p.y+nh/2,nw-Ui.Metrics.xl) })
  }
 }
 Ui.Text { anchors.centerIn: parent; visible: !(root.graph.nodes || []).length; text: "Empty workflow"; role: Ui.Typography.SansCaption }
}
