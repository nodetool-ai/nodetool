#include "scripts/ScriptHost.h"
#include <iostream>
#include <stdexcept>
using namespace nodetool::game;
namespace {
void require(bool value, const char* message) { if (!value) { throw std::runtime_error(message); } }
Json call(const std::string& source, int tick = 0) {
 return {{"entityId","player"},{"behaviorId","movement"},{"sourceDigest","digest"},{"source",source},{"tick",tick},{"state",Json::object()},{"rngState",42},{"input",Json::object()},{"world",Json::array()}};
}
void rejects(ScriptHost& host, const std::string& source) {
 bool failed=false; try { host.invoke(call(source)); } catch(const Error& error) { failed=error.code=="SCRIPT_ERROR"||error.code=="SCRIPT_LIMIT"; }
 require(failed,"Expected bounded script failure");
}
}
int main() {
 try {
  ScriptHost host;
  const auto first=host.invoke(call("input => ({state:{score:42,r:Math.random()},commands:[{kind:'score',amount:2}]})"));
  require(first["state"]["score"]==42,"Function state");
  require(first==host.invoke(call("input => ({state:{score:42,r:Math.random()},commands:[{kind:'score',amount:2}]})")),"Seed repeatability");
  auto lifecycle=call("({onStart(i){i.state.calls=['start'];after(2,'alarm');},onSceneEnter(i){i.state.calls.push('scene');},onTriggerEnter(i){i.state.calls.push('trigger');},onEvent(i){i.state.calls.push('event');},alarm(i){i.state.calls.push('alarm');},onFixedUpdate(i){i.state.calls.push('fixed');},onUpdate(i){i.state.calls.push('update');},onDestroy(i){i.state.calls.push('destroy');}})");
  lifecycle["lifecycle"]={{"start",true},{"sceneEnter",true},{"contacts",Json::array({{{"sensor",true},{"phase","enter"}}})}};
  lifecycle["events"]=Json::array({{{"name","hello"}}});
  auto output=host.invoke(lifecycle);
  require(output["state"]["calls"]==Json::array({"start","scene","trigger","event","fixed","update"}),"Hook ordering");
  lifecycle["tick"]=2; lifecycle["state"]=output["state"]; lifecycle["timers"]=output["timers"]; lifecycle["lifecycle"]={{"started",true}}; lifecycle["events"]=Json::array();
  output=host.invoke(lifecycle);
  require(output["hooks"]==Json::array({"alarm","onFixedUpdate","onUpdate"}),"Named timer hook");
  lifecycle["state"]=output["state"]; lifecycle["lifecycle"]={{"destroy",true}};
  require(host.invoke(lifecycle)["hooks"]==Json::array({"onDestroy"}),"Destroy isolated");
  auto lookup=call("i=>({state:{name:i.world.get('other').name}})"); lookup["world"]=Json::array({{{"id","other"},{"name","Target"}}});
  require(host.invoke(lookup)["state"]["name"]=="Target","Targeted lookup");
  rejects(host,"()=>{while(true){}}");
  rejects(host,"(()=>{while(true){}})()");
  rejects(host,"()=>{const a=[];while(true)a.push('x'.repeat(100000));}");
  rejects(host,"()=>{function f(){return f();}return f();}");
  rejects(host,"()=>({get state(){while(true){}}})");
  rejects(host,"()=>{const x={};x.x=x;return {state:x};}");
  rejects(host,"async ()=>({state:{}})");
  rejects(host,"()=>({state:{invalid:NaN}})");
  rejects(host,"()=>({state:{invalid:()=>1}})");
  require(host.invoke(call("(()=>{globalThis.__nativeRun=()=>'{}';return ()=>({state:{verified:true}});})()"))["state"]["verified"]==true,"Host dispatcher cannot be replaced");
  rejects(host,"()=>({commands:[{kind:'setPosition',position:[1,2]}]})");
  rejects(host,"()=>({commands:[{kind:'unknown'}]})");
  rejects(host,"()=>{for(let i=0;i<2000;i++)command({kind:'score',amount:1});}");
  rejects(host,"()=>({state:{text:'x'.repeat(100000)}})");
  rejects(host,"()=>({state:std.loadFile('/etc/passwd')})");
  rejects(host,"()=>{throw {toString(){while(true){}}};}");
  host.validateSource("({onUpdate(i){i.state.score=1;}})","valid");
  bool invalid=false; try {host.validateSource("({onUpdate: )","invalid");}catch(const Error&){invalid=true;}
  require(invalid,"Candidate syntax rejection");
  const auto fresh=call("(()=>{let retained=0;return ()=>({state:{count:++retained}});})()");
  require(host.invoke(fresh)["state"]["count"]==1 && host.invoke(fresh)["state"]["count"]==1,"Fresh realms discard hidden state");
  const auto globalLeak=call("i=>{globalThis.leak=(globalThis.leak||0)+1;Array.prototype.leak=(Array.prototype.leak||0)+1;return {state:{g:globalThis.leak===undefined,a:[].leak===undefined}};}");
  require(host.invoke(globalLeak)==host.invoke(globalLeak) && host.invoke(globalLeak)["state"]["g"]==true && host.invoke(globalLeak)["state"]["a"]==true,"Reused realms discard global and intrinsic writes");
  require(host.invoke(call("()=>{class Fail extends Error{constructor(){super('x');this.name='Fail';}} const o={}; o.toString=()=>'own'; return {state:{name:new Fail().name,own:String(o)}};}"))["state"]==Json({{"name","Fail"},{"own","own"}}),"Instances override frozen prototype members");
  const auto flaky=call("i=>{if(i.tick===1)throw Error('boom');return {state:{ok:true}};}");
  auto failing=flaky; failing["tick"]=1; bool threw=false; try{host.invoke(failing);}catch(const Error&){threw=true;}
  require(threw && host.invoke(flaky)["state"]["ok"]==true,"Realm recovers after guest error");
  rejects(host,"()=>{while(true){}}");
  require(host.invoke(flaky)["state"]["ok"]==true,"Runtime recovers after budget failure");
  std::cout<<"Bounded QuickJS, lifecycle, timers, query transport, replacement admission passed\n";
  return 0;
 } catch(const std::exception& error) {std::cerr<<error.what()<<'\n';return 1;}
}
