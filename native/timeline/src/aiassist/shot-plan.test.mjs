import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {mediaRefFromAsset} from '../../../../web/src/utils/mediaRef.ts';
import {isString,isObjectLike} from '../../../../web/src/utils/typePredicates.ts';
import {spawnSync} from 'node:child_process';
import {keyframePrompt, clipPromptFor, sceneForShot, CLIP_RESOLUTION, STILL_RESOLUTION, currentRenderInputs, entitiesForShot, injectEntities, assertProductionGenerationAllowed, productionRequirement} from '@nodetool-ai/protocol';
import {compileProductionCandidates} from '@nodetool-ai/timeline';
import {boardRenderContext} from '../../../../web/src/lib/storyboard/boardRenderContext.ts';
// Compile the actual pure mapper declarations without loading the React hook's
// browser-only stores (import.meta.env is unavailable in the Node oracle).
const entityModule = ts.createSourceFile('useEntities.ts',readFileSync(new URL('../../../../web/src/serverState/useEntities.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const mapperNames=new Set(['ENTITY_METADATA_KEY','VALID_KINDS','readEntityMarker','assetToEntity']);
const mapperDeclarations=entityModule.statements.filter(statement=>
 ts.isFunctionDeclaration(statement)?mapperNames.has(statement.name?.text):
 ts.isVariableStatement(statement)&&statement.declarationList.declarations.some(declaration=>ts.isIdentifier(declaration.name)&&mapperNames.has(declaration.name.text)));
assert.equal(mapperDeclarations.length,4,'Inspect every mapper declaration');
const mapperSource=mapperDeclarations.map(statement=>statement.getText(entityModule)).join('\n');
const mapperCode=ts.transpileModule(mapperSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mapperExports={};
new Function('exports','isString','isObjectLike','mediaRefFromAsset',mapperCode)(mapperExports,isString,isObjectLike,mediaRefFromAsset);
const assetToEntity=mapperExports.assetToEntity;
const executable = process.argv[2];
if (!executable) throw new Error('Pass the native ShotPlan oracle executable.');
const base = {id:'shot',index:0,action:' A person runs ',motion:' Quickly ',duration_seconds:4,camera:{framing:'wide',angle:'low',lens:'85mm',movement:'pan',equipment:'dolly'},scene_id:'scene'};
const library = [
 {id:'style-old',kind:'style',name:'Old look',descriptor:'Pastels',reference_images:[{asset_id:'old-picture'}]},
 {id:'mara',kind:'character',name:'Mara',descriptor:' Red coat ',reference_images:[{asset_id:'mara-picture',data:'reference content'}]},
 {id:'unused',kind:'prop',name:'Umbrella',descriptor:'Yellow',reference_images:[{asset_id:'unused-picture'}]},
 {id:'style-new',kind:'style',name:'New look',descriptor:'Ink wash',reference_images:[{uri:'asset://style-picture.png'}]},
 {id:'location',kind:'location',name:'Square',descriptor:'Cobblestones',reference_images:[]}
];
library.push({id:'external',kind:'style',name:'External',descriptor:'External style',reference_images:[{uri:'https://example.invalid/reference.png'}]});
const cast = library.map(entity=>entity.id);
const cases = [
 {shot:{...base,render_mode:'direct'},kind:'video'},
 ...[1,2,3].map(requested_take_count=>({shot:{...base,render_mode:'direct',production:{schema_version:1,speech_mode:'none',requested_take_count,local_direction:'Keep light soft',duration_ms:5500}},kind:'video'})),
 {shot:{...base,render_mode:'direct',production:{protected_inputs:[{id:'logo',kind:'logo',asset_id:'logo-picture'}]}},kind:'video',productionError:true},
 {shot:{...base,render_mode:'direct',production:{speech_mode:'on_camera',speech_binding:{text:'A spoken line'}}},kind:'video',productionError:true},
 {shot:{...base,render_mode:'direct',production:{speech_mode:'on_camera',speech_binding:{audio_asset_id:'speech'},reference_bindings:[{kind:'character',asset_id:'mara-picture'}]}},kind:'video',productionError:true},
 {shot:{...base,render_mode:'direct',production:{duration_ms:2000,speech_duration_ms:3000}},kind:'video',productionError:true},
 {shot:{...base,render_mode:'direct',production:{visual_treatment:'product_close_up'}},kind:'video',productionError:true},
 {shot:{...base,render_mode:'direct',production:{visual_treatment:'product_close_up',reference_bindings:[{kind:'product',asset_id:'product-picture'}]}},kind:'video'},
 {shot:{...base,keyframe:{type:'image',asset_id:'still'}},kind:'video'},
 {shot:{...base,render_mode:'reference',production:{reference_bindings:[{kind:'style',asset_id:'ref',label:'Reference'}]}},kind:'video'},
 {shot:{...base},kind:'image'},
 {shot:{...base,render_mode:'direct',entity_ids:['one','two']},kind:'video'},
 {shot:{...base,keyframe:{type:'image',asset_id:'still'}},kind:'video',tasks:['text_to_video'],error:true},
 {shot:{...base,action:'Mara runs',render_mode:'direct'},kind:'video',cast},
 {shot:{...base,action:'Mara runs'},kind:'image',cast},
 {shot:{...base,action:'Mara runs'},kind:'image',cast,tasks:['text_to_image','image_to_image']},
 {shot:{...base},kind:'image',cast:['external'],tasks:['text_to_image','image_to_image']},
 {shot:{...base,render_mode:'direct'},kind:'video',creativeContext:{reference_bindings:[{kind:'style',asset_id:'board-picture'}]}},
 {shot:{...base,action:'Mara runs',entity_ids:[]},kind:'image',cast},
 {shot:{...base,action:'Mara runs',entity_ids:['mara'],render_mode:'reference'},kind:'video',cast},
 {shot:{...base,action:'Mara runs',render_mode:'reference',production:{reference_bindings:[{kind:'style',asset_id:'shot-picture'},{kind:'character',asset_id:'mara-picture'}]}},kind:'video',cast,creativeContext:{reference_bindings:[{kind:'style',asset_id:'board-picture'}]}},
];
for (const item of cases) {
 const board = {id:'board',document:{shots:[item.shot],style:' Film ',aspectRatio:'9:16',entityIds:item.cast??[],creativeContext:item.creativeContext,screenplay:{scenes:[{id:'scene',lighting:' Evening '}]}}};
 const model = {id:'model',provider:'provider',...(item.tasks?{supported_tasks:item.tasks}:{})};
 const process = spawnSync(executable,[],{input:JSON.stringify({board,shotId:'shot',kind:item.kind,model,entities:library}),encoding:'utf8'});
 assert.equal(process.status,0,process.stderr);
 const actual = JSON.parse(process.stdout);
 if(item.error){ assert.notEqual(actual.error,''); continue; }
 const context = {scene:sceneForShot(item.shot,board.document.screenplay.scenes),style:board.document.style};
 const basePrompt = item.kind === 'image' ? keyframePrompt(item.shot,context) : clipPromptFor(item.shot,context);
 const entities = entitiesForShot(item.shot,(item.cast??[]).map(id=>library.find(entity=>entity.id===id)).filter(Boolean));
 let compiled=[]; let productionError;
 try {
  const requirement=item.shot.production===undefined?undefined:productionRequirement.parse(item.shot.production);
  assertProductionGenerationAllowed(requirement,item.kind==='image'?'text_to_image':'text_to_video');
  if(item.kind==='video') compiled=compileProductionCandidates({batchId:'storyboard-render-plan',destinationId:'shot',destinationKind:'storyboard_shot',operation:'initial_generation',prompt:basePrompt,requirement,entityIds:entities.map(entity=>entity.id),referenceAssetIds:item.shot.render_mode==='reference'?entities.flatMap(entity=>(entity.reference_images??[]).map(image=>image.asset_id??(image.uri?.startsWith('asset://')?image.uri.slice(8).replace(/\.[^.]+$/,''):undefined)).filter(Boolean)):[],referenceBindings:board.document.creativeContext?.reference_bindings??[],provider:'provider',model:'model',requestedDurationMs:4000,routeSupport:{referenceToVideo:true,audioDrivenPerformance:false}});
 }catch(error){productionError=error.message;}
 if(productionError){assert.equal(actual.error,productionError);continue;}
 assert.equal(actual.error,'');
 const useEdit = item.kind==='image' && entities.some(entity=>entity.reference_images?.length) && item.tasks?.includes('image_to_image');
 const suffix = entities.length?'\n'+entities.map(entity=>'entity://'+entity.id).join(' '):'';
 const prompt = item.kind==='video'||useEdit ? (compiled[0]?.snapshot.prompt??basePrompt)+suffix : injectEntities(basePrompt,entities,entities.map(entity=>entity.id)).prompt;
 const expected = {mode:item.kind,prompt,provider:'provider',model:'model',aspect_ratio:'9:16',resolution:item.kind==='image'?STILL_RESOLUTION:CLIP_RESOLUTION,variations:1};
 const renderContext=boardRenderContext(board.document,library,{...item.shot,[item.kind==='image'?'still_model':'clip_model']:model});
 const draft = currentRenderInputs(item.shot,{...renderContext,image_model:'model',video_model:'model'},item.kind==='image'?'keyframe':'clip');
 if(item.kind==='video'){
  expected.duration=(compiled[0]?.snapshot.requestedDurationMs??4000)/1000;
  if(draft.render_mode==='reference'){ expected.capability='reference_to_video'; expected.reference_images=draft.reference_asset_ids.map(asset_id=>({type:'image',asset_id})); }
  else if(item.shot.render_mode!=='direct'){ expected.source_asset_id='still'; }
 }
 assert.deepEqual(actual.request,expected);
 assert.deepEqual(actual.requests,Array.from({length:compiled.length||1},()=>expected));
 assert.deepEqual(actual.productionCandidates,JSON.parse(JSON.stringify(compiled)));
 const {recorded_at,...nativeInputs}=actual.renderInputs;
 assert.ok(recorded_at);
 assert.deepEqual(nativeInputs,draft);
}
const markerAssets=[
 {id:'style-asset',project_id:'project',created_at:'created',metadata:{nodetool_entity:{kind:'style',name:'Look',descriptor:'Ink',reference_asset_id:' swapped ',voice_id:null,lora:null,palette:null,tags:['ink',9],arbitrary:'ignored'}}},
 {id:'character-asset',metadata:{nodetool_entity:{kind:'character',name:'Mara',descriptor:'Coat',description:7,voice_id:9,reference_asset_id:13}}},
 {id:'ordinary',metadata:{}},
 {id:'invalid-kind',metadata:{nodetool_entity:{kind:'invalid',name:'No'}}}
];
const mapped=markerAssets.map(assetToEntity).filter(Boolean);
for(const kind of ['image','video']){
 const shot={...base,action:'Mara runs',render_mode:kind==='video'?'reference':undefined};
 const board={id:'boundary-board',document:{shots:[shot],entityIds:['style-asset','character-asset'],style:'Ink',aspectRatio:'16:9'}};
 const model={id:'model',provider:'provider',supported_tasks:kind==='image'?['text_to_image','image_to_image']:['reference_to_video']};
 const native=spawnSync(executable,[],{input:JSON.stringify({board,shotId:'shot',kind,model,assets:markerAssets}),encoding:'utf8'});
 assert.equal(native.status,0,native.stderr);
 const actual=JSON.parse(native.stdout);
 assert.deepEqual(actual.entities,JSON.parse(JSON.stringify(mapped)),'assets.search marker conversion must match actual useEntities.assetToEntity');
 assert.equal(actual.error,'');
 const context=boardRenderContext(board.document,mapped,shot);
 const draft=currentRenderInputs(shot,{...context,image_model:'model',video_model:'model'},kind==='image'?'keyframe':'clip');
 const {recorded_at,...inputs}=actual.renderInputs;
 assert.deepEqual(inputs,draft,'production marker boundary reference lists and conditioning hashes must match web');
}
console.log(`${cases.length} shot request differential cases and 2 asset boundary cases passed`);
