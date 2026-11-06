(() => {
  'use strict';
  const { groups, states, nodes, edges } = window.FEATURE_INTERPLAY_DATA;
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length || edges.some(edge => !byId.has(edge.a) || !byId.has(edge.b))) {
    throw new Error('The map contains duplicate feature IDs or unresolved connections.');
  }
  const svg = document.getElementById('graph');
  const world = document.getElementById('world');
  const inspector = document.getElementById('inspector');
  const featurePicker = document.getElementById('feature');
  const connectionPicker = document.getElementById('connections');
  const sparseToggle = document.getElementById('sparse');
  const positions = new Map();
  const nodeElements = new Map();
  const edgeElements = new Map();
  const origins = [[500,450],[500,0],[1000,0],[0,0],[0,450],[0,900],[500,900],[1000,900],[1000,450]];
  const areaBounds = groups.map((name, index) => ({
    name, x: origins[index][0], y: origins[index][1], width: 440,
    height: 88 + Math.ceil(nodes.filter(node => node.g === index).length / 2) * 58
  }));
  const bounds = { x: -24, y: -24, width: 1488, height: Math.max(...areaBounds.map(area => area.y + area.height)) + 48 };
  const camera = { x: 0, y: 0, scale: 1 };
  let selectedNode = null;
  let selectedEdge = null;
  let filter = 'all';
  let highlightSparse = false;
  let fitted = true;
  let initialized = false;
  const availableNodes = new Set(nodes.filter(node => ['S', 'D'].includes(node.status)).map(node => node.id));
  const existingDegree = new Map(nodes.map(node => [node.id, 0]));
  const adjacency = new Map(nodes.map(node => [node.id, new Set()]));
  for (const edge of edges) {
    if (['S','D'].includes(edge.status) && availableNodes.has(edge.a) && availableNodes.has(edge.b)) {
      adjacency.get(edge.a).add(edge.b);
      adjacency.get(edge.b).add(edge.a);
    }
  }
  for (const [id, neighbors] of adjacency) { existingDegree.set(id, neighbors.size); }
  const sparseNodes = nodes.filter(node => availableNodes.has(node.id) && existingDegree.get(node.id) <= 1);
  const element = (tag, className, text) => {
    const item = document.createElement(tag);
    if (className) { item.className = className; }
    if (text !== undefined) { item.textContent = text; }
    return item;
  };
  const svgElement = (tag, attributes = {}) => {
    const item = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) { item.setAttribute(key, String(value)); }
    return item;
  };
  const action = (label, handler, className = 'text-button') => {
    const button = element('button', className, label);
    button.type = 'button';
    button.addEventListener('click', handler);
    return button;
  };
  function statusLabel(status) {
    const item = element('span', 'status', states[status]);
    item.dataset.status = status;
    return item;
  }
  function evidence(path) {
    const block = element('div', 'source');
    const link = element('a', '', path);
    link.href = '../../../' + path;
    link.target = '_blank';
    link.rel = 'noopener';
    block.append(link);
    if (path.startsWith('docs/plans/') || path.startsWith('docs/research/')) {
      block.append(element('p', 'note', 'Local research or proposal. Not evidence that the proposed connection is shipped.'));
    }
    return block;
  }
  function isVisible(edge) {
    return filter === 'all' || edge.status === filter ||
      (filter === 'existing' && ['S','D'].includes(edge.status)) ||
      (filter === 'opportunities' && ['L','Q','P'].includes(edge.status));
  }
  function updateCamera() {
    world.setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
    document.getElementById('zoom').textContent = Math.round(camera.scale * 100) + '%';
    const labelSize = Math.max(14, 11 / camera.scale);
    const maxCharacters = Math.max(5, Math.floor(152 / (labelSize * .55)));
    for (const node of nodes) {
      const label = nodeElements.get(node.id).querySelector('text');
      label.style.fontSize = labelSize + 'px';
      label.textContent = node.label.length > maxCharacters ? node.label.slice(0, maxCharacters - 1) + '…' : node.label;
      let length = Math.min(node.label.length, maxCharacters - 1);
      while (length > 1 && label.getComputedTextLength() > 152) {
        length -= 1;
        label.textContent = node.label.slice(0, length) + '…';
      }
      label.style.display = camera.scale < .32 ? 'none' : '';
    }
    for (const label of svg.querySelectorAll('.area-label')) {
      label.style.fontSize = Math.max(20, 14 / camera.scale) + 'px';
    }
  }
  function fitArea(area, padding = 28) {
    const width = svg.clientWidth, height = svg.clientHeight;
    camera.scale = Math.min(2, Math.max(.12, Math.min((width - padding * 2) / area.width, (height - padding * 2) / area.height)));
    camera.x = (width - area.width * camera.scale) / 2 - area.x * camera.scale;
    camera.y = (height - area.height * camera.scale) / 2 - area.y * camera.scale;
    updateCamera();
  }
  function fitAll() { fitted = true; fitArea(bounds); }
  function zoomAt(factor, x = svg.clientWidth / 2, y = svg.clientHeight / 2) {
    const next = Math.min(3.5, Math.max(.12, camera.scale * factor));
    const ratio = next / camera.scale;
    camera.x = x - (x - camera.x) * ratio;
    camera.y = y - (y - camera.y) * ratio;
    camera.scale = next;
    fitted = false;
    updateCamera();
  }
  function focusNode(id) {
    const point = positions.get(id);
    fitted = false;
    camera.scale = Math.max(.9, camera.scale);
    camera.x = svg.clientWidth / 2 - point.x * camera.scale;
    camera.y = svg.clientHeight / 2 - point.y * camera.scale;
    updateCamera();
  }
  function selectNode(id, focus = false) {
    selectedNode = id;
    selectedEdge = null;
    featurePicker.value = id;
    updateGraph();
    inspectNode(byId.get(id));
    if (focus) { focusNode(id); }
  }
  function selectEdge(edge) {
    selectedNode = null;
    selectedEdge = edge.id;
    featurePicker.value = '';
    updateGraph();
    inspector.replaceChildren(element('div','eyebrow','CONNECTION'), element('h2','',edge.label),statusLabel(edge.status));
    inspector.append(action(byId.get(edge.a).label, () => selectNode(edge.a, true)),element('div','note','↓'),action(byId.get(edge.b).label, () => selectNode(edge.b, true)));
    inspector.append(element('p','',edge.detail),evidence(edge.path));
  }
  function clearSelection() {
    selectedNode = null;
    selectedEdge = null;
    featurePicker.value = '';
    updateGraph();
    inspectOverview();
  }
  function updateGraph() {
    const visible = edges.filter(isVisible);
    const incident = new Set();
    const highlighted = new Set();
    const selected = edges.find(edge => edge.id === selectedEdge);
    if (selectedNode) { highlighted.add(selectedNode); }
    if (selected) { highlighted.add(selected.a); highlighted.add(selected.b); }
    for (const edge of visible) {
      incident.add(edge.a); incident.add(edge.b);
      if (selectedNode && (edge.a === selectedNode || edge.b === selectedNode)) {
        highlighted.add(edge.a); highlighted.add(edge.b);
      }
    }
    for (const edge of edges) {
      const item = edgeElements.get(edge.id);
      const shown = isVisible(edge);
      item.toggleAttribute('hidden', !shown);
      item.setAttribute('tabindex', shown ? '0' : '-1');
      const active = edge.id === selectedEdge || (selectedNode && (edge.a === selectedNode || edge.b === selectedNode));
      item.classList.toggle('active', Boolean(active));
      item.classList.toggle('dim', Boolean((selectedNode || selectedEdge) && !active));
    }
    for (const node of nodes) {
      const item = nodeElements.get(node.id);
      item.classList.toggle('active', node.id === selectedNode || Boolean(selected && [selected.a,selected.b].includes(node.id)));
      item.classList.toggle('dim', selectedNode || selectedEdge ? !highlighted.has(node.id) : filter !== 'all' && !incident.has(node.id));
      item.classList.toggle('sparse', highlightSparse && availableNodes.has(node.id) && existingDegree.get(node.id) <= 1);
    }
    document.getElementById('graph-summary').textContent = `${nodes.length} mapped features · ${visible.length} / ${edges.length} connections shown`;
  }
  function inspectOverview() {
    inspector.replaceChildren(element('div','eyebrow','READING THE MAP'),element('h2','','Systems, not a scorecard'));
    inspector.append(element('p','','Select a feature to highlight its direct connections. Select a line for its meaning and evidence. Area titles zoom to their group.'));
    inspector.append(element('p','note','Source-backed and documented edges represent inspected implementation or guides. Limits and questions identify boundaries to investigate. Dashed purple connections are proposals.'));
    inspector.append(element('h3','','Find the gaps'));
    inspector.append(element('p','','Switch Connections to Existing, then Proposed improvements to compare the current map with candidate bridges. Every feature stays in the same position.'));
    inspector.append(element('p','note','Position is for readability. Link count is not quality, and a working specialist feature can legitimately have few neighbors.'));
    inspector.append(element('h3','',highlightSparse ? 'Sparsely mapped features' : 'Feature areas'));
    const list = element('div','node-list');
    if (highlightSparse) {
      for (const node of sparseNodes) { list.append(action(`${node.label} (${existingDegree.get(node.id)})`,()=>selectNode(node.id,true))); }
      inspector.append(element('p','note','Distinct existing neighbors only, ignoring direction and duplicate links. Questions, known-limit nodes and proposed features are excluded.'));
    } else {
      for (const [index,name] of groups.entries()) { list.append(action(name,()=>{fitted=false;fitArea(areaBounds[index]);})); }
    }
    inspector.append(list);
  }
  function inspectNode(node) {
    inspector.replaceChildren(element('div','eyebrow',groups[node.g].toUpperCase()),element('h2','',node.label),statusLabel(node.status),element('p','',node.description));
    inspector.append(evidence(node.path));
    if (availableNodes.has(node.id)) { inspector.append(element('p','note',`${existingDegree.get(node.id)} distinct mapped existing neighbors. This is coverage, not a quality rating.`)); }
    inspector.append(action('Zoom to feature area',()=>{fitted=false;fitArea(areaBounds[node.g]);}));
    const related = edges.filter(edge=>(edge.a===node.id||edge.b===node.id)&&isVisible(edge));
    inspector.append(element('h3','',`Connections in this view (${related.length})`));
    const list=element('div','relations');
    for (const edge of related) {
      const incoming=edge.b===node.id;
      const other=byId.get(incoming?edge.a:edge.b);
      const row=element('div','relation');
      row.append(statusLabel(edge.status),action((incoming?'← ':'→ ')+other.label,()=>selectNode(other.id,true)),action(edge.label,()=>selectEdge(edge)));
      list.append(row);
    }
    if (!related.length) { list.append(element('p','note','No mapped connections match this filter. Choose All evidence states to see other relationships.')); }
    inspector.append(list);
  }
  function edgePath(edge, offset) {
    const a=positions.get(edge.a), b=positions.get(edge.b);
    const dx=b.x-a.x, dy=b.y-a.y;
    const vertical=Math.abs(dy)>Math.abs(dx);
    const start={x:a.x+(vertical?0:Math.sign(dx)*94),y:a.y+(vertical?Math.sign(dy)*22:0)};
    const end={x:b.x-(vertical?0:Math.sign(dx)*94),y:b.y-(vertical?Math.sign(dy)*22:0)};
    if (vertical) {
      const mid=(start.y+end.y)/2;
      return `M ${start.x} ${start.y} C ${start.x+offset} ${mid}, ${end.x+offset} ${mid}, ${end.x} ${end.y}`;
    }
    const mid=(start.x+end.x)/2;
    return `M ${start.x} ${start.y} C ${mid} ${start.y+offset}, ${mid} ${end.y+offset}, ${end.x} ${end.y}`;
  }
  for (const [index,area] of areaBounds.entries()) {
    const group=svgElement('g',{'class':'area-hit','data-area':index,tabindex:0,role:'button','aria-label':'Zoom to '+area.name,style:`--area:var(--area${index})`});
    group.append(svgElement('rect',{x:area.x,y:area.y,width:area.width,height:area.height,rx:16,'class':'area-box'}));
    const label=svgElement('text',{x:area.x+22,y:area.y+40,'class':'area-label'});label.textContent=area.name;group.append(label);
    group.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();fitted=false;fitArea(area);}});
    document.getElementById('areas').append(group);
    const options=element('optgroup');options.label=area.name;
    nodes.filter(node=>node.g===index).forEach((node,i)=>{
      const x=area.x+116+(i%2)*208,y=area.y+90+Math.floor(i/2)*58;
      positions.set(node.id,{x,y});
      const option=element('option','',node.label);option.value=node.id;options.append(option);
      const item=svgElement('g',{'class':'feature'+(node.status==='P'?' proposed':node.status==='Q'?' question':''),'data-node':node.id,transform:`translate(${x} ${y})`,tabindex:0,role:'button','aria-label':node.label+', '+states[node.status],style:`--area:var(--area${index})`});
      const title=svgElement('title');title.textContent=node.label+' — '+states[node.status];
      item.append(title,svgElement('rect',{x:-94,y:-22,width:188,height:44,rx:9}),svgElement('circle',{cx:-80,cy:0,r:3}));
      const text=svgElement('text',{x:-68,y:5});text.textContent=node.label;item.append(text);
      item.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();selectNode(node.id);}});
      nodeElements.set(node.id,item);document.getElementById('nodes').append(item);
    });
    featurePicker.append(options);
  }
  const pairs=new Map();
  for (const edge of edges) {
    const key=[edge.a,edge.b].sort().join('|');
    if(!pairs.has(key)){pairs.set(key,[]);}pairs.get(key).push(edge);
  }
  for (const edge of edges) {
    const siblings=pairs.get([edge.a,edge.b].sort().join('|'));
    const offset=(siblings.indexOf(edge)-(siblings.length-1)/2)*80;
    const item=svgElement('g',{'class':'edge','data-edge':edge.id,tabindex:0,role:'button','aria-label':`${byId.get(edge.a).label} to ${byId.get(edge.b).label}: ${states[edge.status]}, ${edge.label}`});
    const title=svgElement('title');title.textContent=`${byId.get(edge.a).label} → ${byId.get(edge.b).label}: ${edge.label} (${states[edge.status]})`;
    const d=edgePath(edge,offset);
    item.append(title,svgElement('path',{d,'class':'edge-line','data-status':edge.status,'marker-end':'url(#arrow)'}),svgElement('path',{d,'class':'edge-hit'}));
    item.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();selectEdge(edge);}});
    edgeElements.set(edge.id,item);document.getElementById('edges').append(item);
  }
  featurePicker.addEventListener('change',()=>{if(featurePicker.value){selectNode(featurePicker.value,true);}else{clearSelection();fitAll();}});
  connectionPicker.addEventListener('change',()=>{
    filter=connectionPicker.value;
    if(selectedEdge&&!isVisible(edges.find(edge=>edge.id===selectedEdge))){selectedEdge=null;}
    updateGraph();
    if(selectedNode){inspectNode(byId.get(selectedNode));}else if(!selectedEdge){inspectOverview();}
  });
  sparseToggle.addEventListener('change',()=>{highlightSparse=sparseToggle.checked;updateGraph();if(!selectedNode&&!selectedEdge){inspectOverview();}});
  document.getElementById('zoom-in').addEventListener('click',()=>zoomAt(1.3));
  document.getElementById('zoom-out').addEventListener('click',()=>zoomAt(1/1.3));
  document.getElementById('fit').addEventListener('click',fitAll);
  document.getElementById('clear').addEventListener('click',clearSelection);
  svg.addEventListener('wheel',event=>{event.preventDefault();const rect=svg.getBoundingClientRect();zoomAt(Math.exp(-event.deltaY*.002),event.clientX-rect.left,event.clientY-rect.top);},{passive:false});
  const pointers=new Map();
  let gesture=null;
  function resetGesture() {
    const points=[...pointers.values()];
    if(points.length===2){
      const mid={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};
      gesture={kind:'pinch',distance:Math.max(1,Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y)),mid,camera:{...camera}};
    } else if(points.length===1) { gesture={kind:'pan',start:{...points[0]},camera:{...camera},moved:false,target:points[0].target}; }
    else {gesture=null;}
  }
  svg.addEventListener('pointerdown',event=>{
    if(event.button!==0 || pointers.size>=2){return;}
    const rect=svg.getBoundingClientRect();
    pointers.set(event.pointerId,{x:event.clientX-rect.left,y:event.clientY-rect.top,target:event.target.closest('[data-node],[data-edge],[data-area]')});
    svg.setPointerCapture(event.pointerId);svg.classList.add('dragging');resetGesture();
  });
  svg.addEventListener('pointermove',event=>{
    if(!pointers.has(event.pointerId)){return;}
    const rect=svg.getBoundingClientRect(),point=pointers.get(event.pointerId);
    point.x=event.clientX-rect.left;point.y=event.clientY-rect.top;
    if(gesture.kind==='pinch'){
      const points=[...pointers.values()],mid={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};
      const distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
      camera.scale=Math.max(.12,Math.min(3.5,gesture.camera.scale*distance/gesture.distance));
      const ratio=camera.scale/gesture.camera.scale;
      camera.x=mid.x-(gesture.mid.x-gesture.camera.x)*ratio;camera.y=mid.y-(gesture.mid.y-gesture.camera.y)*ratio;
    }else{
      const dx=point.x-gesture.start.x,dy=point.y-gesture.start.y;
      gesture.moved=gesture.moved||Math.hypot(dx,dy)>4;
      camera.x=gesture.camera.x+dx;camera.y=gesture.camera.y+dy;
    }
    fitted=false;updateCamera();
  });
  function endPointer(event,cancelled=false){
    if(!pointers.has(event.pointerId)){return;}
    const tap=!cancelled&&gesture?.kind==='pan'&&!gesture.moved;
    const target=gesture?.target;
    pointers.delete(event.pointerId);
    if(svg.hasPointerCapture(event.pointerId)){svg.releasePointerCapture(event.pointerId);}
    if(tap&&target){
      if(target.dataset.node){selectNode(target.dataset.node);}
      else if(target.dataset.edge){selectEdge(edges.find(edge=>edge.id===target.dataset.edge));}
      else if(target.dataset.area!==undefined){fitted=false;fitArea(areaBounds[Number(target.dataset.area)]);}
    }
    if(!pointers.size){svg.classList.remove('dragging');}
    resetGesture();
    if(pointers.size===1){gesture.moved=true;}
  }
  svg.addEventListener('pointerup',event=>endPointer(event));
  svg.addEventListener('pointercancel',event=>endPointer(event,true));
  svg.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();clearSelection();}
    if(['+','=','-'].includes(event.key)){event.preventDefault();zoomAt(event.key==='-'?1/1.3:1.3);}
    const moves={ArrowLeft:[40,0],ArrowRight:[-40,0],ArrowUp:[0,40],ArrowDown:[0,-40]};
    if(moves[event.key]){event.preventDefault();camera.x+=moves[event.key][0];camera.y+=moves[event.key][1];fitted=false;updateCamera();}
    if(event.key.toLowerCase()==='f'){event.preventDefault();fitAll();}
  });
  new ResizeObserver(()=>{if(!initialized||fitted){fitAll();initialized=true;}}).observe(svg);
  updateGraph();inspectOverview();fitAll();
  document.body.dataset.ready='true';
})();
