// Native port of web/src/utils/codeOutputInference.ts. Acorn owns syntax validation.
function infer(code) {
  var ast;
  var opts = {ecmaVersion:'latest',sourceType:'module',allowReturnOutsideFunction:true,allowAwaitOutsideFunction:true};
  try { ast=acorn.parse(code,opts); } catch(e) {
    try { ast=acorn.parse('(async function() { '+code+' })()',opts); } catch(e) { return {inputs:[],outputs:[]}; }
  }
  function walk(node, visit, parent) {
    if (!node || typeof node.type !== 'string') return;
    Object.keys(node).forEach(function(k) {
      if(k==='type'||k==='start'||k==='end') return;
      var v=node[k];
      if(Array.isArray(v)) v.forEach(function(x){walk(x,visit,node);});
      else if(v && typeof v==='object') walk(v,visit,node);
    });
    visit(node,parent);
  }
  var shadow={},inputs=[],emits=[],returns=[];
  function add(a,k) { if(a.indexOf(k)<0) a.push(k); }
  function bindings(n) {
    if(!n) return;
    if(n.type==='Identifier') shadow[n.name]=true;
    else if(n.type==='ObjectPattern') n.properties.forEach(function(p){bindings(p.type==='RestElement'?p.argument:p.value);});
    else if(n.type==='ArrayPattern') n.elements.forEach(bindings);
    else if(n.type==='RestElement') bindings(n.argument);
    else if(n.type==='AssignmentPattern') bindings(n.left);
  }
  walk(ast,function(n){
    if(n.type==='VariableDeclarator') bindings(n.id);
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].indexOf(n.type)>=0) n.params.forEach(bindings);
  });
  function literal(n,a) { if(n && n.type==='Literal' && typeof n.value==='string' && n.value!=='') add(a,n.value); }
  walk(ast,function(n,p){
    if(!shadow.inputs && n.type==='Identifier' && n.name==='inputs' && p && p.type==='MemberExpression' && p.object===n) {
      if(!p.computed && p.property.type==='Identifier') add(inputs,p.property.name);
      else if(p.computed && p.property.type==='Literal' && typeof p.property.value==='string') add(inputs,p.property.value);
    }
    if(n.type==='CallExpression') {
      var c=n.callee;
      if(c.type==='Identifier' && (c.name==='emit'||c.name==='output')) { var first=n.arguments[0]; if(first && first.type==='Literal' && typeof first.value==='string') add(emits,first.value); }
      if(!shadow.stream && ((c.type==='Identifier' && c.name==='stream') || (c.type==='MemberExpression' && !c.computed && c.object.type==='Identifier' && c.object.name==='stream' && ['first','open'].indexOf(c.property.name)>=0))) literal(n.arguments[0],inputs);
    }
    if(n.type==='ReturnStatement' && n.argument && n.argument.type==='ObjectExpression') {
      var keys=[];
      n.argument.properties.forEach(function(p){if(p.type==='SpreadElement') return; if(p.key.type==='Identifier') keys.push(p.key.name); else if(p.key.type==='Literal' && typeof p.key.value==='string') keys.push(p.key.value);});
      if(keys.length) returns=keys;
    }
  });
  var reserved=['code','script','packages','secrets','timeout','max_response_mb','allow_local_network','allow_host_filesystem'];
  return {inputs:inputs.filter(function(k){return reserved.indexOf(k)<0;}),outputs:emits.length?emits:returns};
}
