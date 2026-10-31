import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("keeps committed output, HUD focus and audio ownership through restore and disposal", async () => {
  const bundle = await build({ stdin: { resolveDir: resolve("."), contents: `
    import {NativeJsonSaveHost} from "@nodetool-ai/game-runtime/native-browser";
    import {createNativeAudio} from './src/native-cpp/audio.ts';
    import {createNativeHud} from './src/native-cpp/hud.ts';
    import {createNativePresentationPlayer} from './src/native-cpp/player.ts';
    window.runPresentation=async()=>{
      let deliver;const saves=new NativeJsonSaveHost({async read(){return await new Promise(resolve=>deliver=resolve)},async write(){}});saves.consume([{kind:"load",scope:"progress",slot:"main",generation:1,tick:1,sequence:0}],1);await Promise.resolve();saves.reset(2);saves.consume([],2);deliver({formatVersion:1,data:{old:true}});await saves.drain();const staleLoads=saves.takeLoaded(2);saves.consume([{kind:"load",scope:"progress",slot:"main",generation:2,tick:2,sequence:0}],2);await Promise.resolve();deliver({formatVersion:1,data:{fresh:true}});await saves.drain();const freshLoads=saves.takeLoaded(2);
      const context=new AudioContext();let starts=0;
      const original=context.createBufferSource.bind(context);
      context.createBufferSource=()=>{const source=original();const start=source.start.bind(source);source.start=(...args)=>{starts++;return start(...args)};return source};
      const wav=new Uint8Array(2044),view=new DataView(wav.buffer),text=new TextEncoder();
      wav.set(text.encode('RIFF'));view.setUint32(4,2036,true);wav.set(text.encode('WAVEfmt '),8);view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);wav.set(text.encode('data'),36);view.setUint32(40,2000,true);
      for(let i=0;i<1000;i++){view.setInt16(44+i*2,Math.sin(i*2*Math.PI*440/8000)*16000,true)}
      const assets={entries:[{id:'sound',kind:'audio'}],async get(){return wav}};
      const audio=await createNativeAudio({assets,ticksPerSecond:60,context});
      const event={presentationType:'audio',kind:'play',id:'once',assetId:'sound',generation:1,tick:1,volume:0.1,loop:false,bus:'sfx',music:false};
      const base={dimension:"2d",camera:{x:0,y:0},score:3,health:90,tick:1,generation:1,hud:[{kind:'button',id:'go',text:'Go {tick} {score} {health}',action:'go',bounds:[.1,.2,.3,.2]}],presentationEvents:[event],music:[]};
      audio.consume(base);const locked=starts;await audio.suspend();await audio.resume();const lockedResumeState=context.state;await audio.unlock();const unlocked=starts;
      audio.consume({...base,tick:2,presentationEvents:[{...event,tick:2,id:'new'}]});
      const once=starts;audio.consume({...base,tick:2});const duplicate=starts;
      audio.consume({...base,generation:2,music:[{...event,id:'music',music:true,loop:true,generation:2,startTick:0}]});
      const restored=starts; await audio.suspend(); const restorePlayer=createNativePresentationPlayer({host:{subscribe(){return()=>{}},pause(){},resume(){},async close(){}},renderer:{render(){},resize(){},dispose(){}},audio,onError(error){throw error}}); restorePlayer.contextLost(); await new Promise(resolve=>setTimeout(resolve,20)); restorePlayer.contextRestored(); await new Promise(resolve=>setTimeout(resolve,20)); const resumedAudioState=context.state,resumedStarts=starts; audio.consume({...base,tick:3,generation:2,dimension:"2d",camera:{x:100,y:20},presentationEvents:[]}); const listener2d=[context.listener.positionX.value,context.listener.positionY.value,context.listener.positionZ.value]; audio.consume({...base,tick:4,generation:2,dimension:"3d",camera:{position:[7,8,9],target:[7,8,8]},presentationEvents:[]}); const listener3d=[context.listener.positionX.value,context.listener.positionY.value,context.listener.positionZ.value];
      const container=document.createElement('div');document.body.append(container);const actions=[];
      const hud=createNativeHud({container,onAction:(...args)=>actions.push(args)});hud.resize(200,100);hud.render(base);
      const button=container.querySelector('button');button.focus();button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));hud.render({...base,tick:2});
      const focused=document.activeElement===button; const boundText=button.textContent,boundLabel=button.getAttribute("aria-label");button.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter'}));const hit=hud.hitTest(30,30);hud.render({...base,generation:2,tick:0,score:0,health:100});const transitionText=button.textContent,transitionFocus=document.activeElement===button;const style=getComputedStyle(button);const hudStyle={fontSize:style.fontSize,color:style.color,paddingLeft:style.paddingLeft,borderRadius:style.borderRadius,alignItems:style.alignItems};
      let benchListener,finishes=0,completed=0;const bench=createNativePresentationPlayer({benchmarkGpuCompletion:true,onPresentedFrame(frame,elapsed,gpu){if(gpu&&elapsed>=0)completed++},host:{subscribe(fn){benchListener=fn;return()=>{}},pause(){},resume(){},async close(){}},renderer:{render(){},finishFrame(){finishes++},resize(){},dispose(){}},onError(error){throw error}});benchListener(base);await new Promise(requestAnimationFrame);await bench.dispose();
      let listener,paused=0,resumed=0,closed=0,draws=0,outputs=0,commits=[];
      const player=createNativePresentationPlayer({onCommittedFrame(frame){commits.push(frame.tick)},host:{subscribe(fn){listener=fn;return()=>listener=undefined},pause(){paused++},resume(){resumed++},async close(){closed++}},renderer:{render(){draws++},resize(){},dispose(){}},audio:{consume(){outputs++},async unlock(){},async suspend(){},async resume(){},async dispose(){}},onError(error){throw error}});
      listener(base);listener({...base,tick:2});await new Promise(requestAnimationFrame);player.contextLost();listener({...base,tick:3});player.contextRestored();await player.dispose();await player.dispose();
      hud.dispose();await audio.dispose(); const spatial=async(x)=>{const offline=new OfflineAudioContext(2,1600,8000);offline.resume=async()=>{};const owner=await createNativeAudio({assets,ticksPerSecond:60,context:offline});owner.consume({...base,camera:{x,y:0},presentationEvents:[]});await owner.unlock();owner.consume({...base,tick:2,camera:{x,y:0},presentationEvents:[{...event,tick:2,position:{x:100,y:0}}]});const pcm=await offline.startRendering();return [0,1].map(channel=>pcm.getChannelData(channel).reduce((sum,v)=>sum+v*v,0));}; const near=await spatial(100),right=await spatial(99),far=await spatial(0);return{finishes,completed,freshLoads,staleLoads,near,right,far,lockedResumeState,locked,unlocked,once,duplicate,restored,resumedStarts,resumedAudioState,listener2d,listener3d,focused,boundText,boundLabel,transitionText,transitionFocus,hudStyle,hit,actions,paused,resumed,closed,draws,outputs,commits,remaining:container.children.length,audioState:context.state};
    };
  ` }, bundle: true, platform: "browser", format: "iife", write: false, conditions: ["nodetool-dev"] });
  const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  try {
    const page = await browser.newPage();
    await page.goto("about:blank");
    const output = bundle.outputFiles?.[0];
    if (!output) { throw new Error("Missing presentation fixture bundle"); }
    await page.addScriptTag({ content: output.text });
    const result = await page.evaluate(async () => Reflect.get(window, "runPresentation")());
    expect(result).toMatchObject({ finishes:1,completed:1,freshLoads:[{scope:"progress",slot:"main",data:{fresh:true}}],staleLoads:[], locked: 0, unlocked: 0, once: 1, duplicate: 1, restored: 2,
      lockedResumeState: "suspended", resumedAudioState: "running", resumedStarts:2, listener2d: [100, 20, 0], listener3d: [7, 8, 9], focused: true, boundText: "Go 2 3 90", boundLabel: "Go 2 3 90", transitionText: "Go 0 0 100", transitionFocus:true, hudStyle:{fontSize:"18.6667px",color:"rgb(244, 246, 250)",paddingLeft:"8px",borderRadius:"4px",alignItems:"center"}, hit: "go", actions: [["go", true], ["go", false]], paused: 1, resumed: 1,
      closed: 1, outputs: 3, commits: [1, 2, 3], remaining: 0, audioState: "closed" });
    expect(result.draws).toBe(2);
    expect(result.near[0] + result.near[1]).toBeGreaterThan((result.far[0] + result.far[1]) * 100);
    expect(result.right[1]).toBeGreaterThan(result.right[0] * 2);
  } finally { await browser.close(); }
});
