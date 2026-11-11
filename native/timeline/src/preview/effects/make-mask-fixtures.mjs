import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const directory=fileURLToPath(new URL("./fixtures/",import.meta.url));
const template=JSON.parse(fs.readFileSync(`${directory}/clip-blur.json`,"utf8"));
const picture=() => ({ ...template.clips[0], id:"picture", name:"picture", startMs:0, durationMs:2000,
  mediaType:"image", mediaPath:"source-pattern.png", effects:[] });
function save(name,clips,frames,criterion) {
  const doc={ ...template, id:`seq-${name}`,name,durationMs:2000,clips,
    goldenFrames:frames.map(frame => ({frame,criterion:`J4 ${criterion}, PSNR >= 40 dB`})) };
  fs.writeFileSync(`${directory}/${name}.json`,`${JSON.stringify(doc,null,2)}\n`);
}
const region={x:0.12,y:0.13,width:0.58,height:0.65};
const masks={
  rect:{kind:"rect",...region},
  ellipse:{kind:"ellipse",...region},
  rounded:{kind:"rect",...region,radiusPx:150},
  path:{kind:"path",d:"M .1 .15 L .8 .2 Q .95 .55 .55 .85 L .18 .75 Z"},
  feather:{kind:"rect",...region,featherPx:90},
  "ellipse-feather":{kind:"ellipse",...region,featherPx:100},
  invert:{kind:"ellipse",...region,invert:true,featherPx:55},
  "path-feather":{kind:"path",d:"M .1 .15 L .8 .2 Q .95 .55 .55 .85 L .18 .75 Z",featherPx:24},
  "rounded-feather":{kind:"rect",...region,radiusPx:150,featherPx:24},
  "path-invert":{kind:"path",d:"M .1 .15 L .8 .2 Q .95 .55 .55 .85 L .18 .75 Z",featherPx:24,invert:true},
  "rounded-invert":{kind:"rect",...region,radiusPx:150,featherPx:24,invert:true}
};
for (const [name,mask] of Object.entries(masks)) { const clip=picture(); clip.mask=mask; save(`mask-${name}`,[clip],[0],`shape mask ${name}`); }
const chain=picture(); chain.mask={kind:"ellipse",...region};
chain.crop={left:0.1,right:0.1,top:0,bottom:0};
chain.effects=[{id:"blur",type:"blur",enabled:true,radius:16},{id:"vignette",type:"vignette",enabled:true,amount:0.8,radius:1,softness:0.6}];
save("mask-effects",[chain],[0],"crop then blur and vignette then shape mask");
for (const mode of ["alpha","luma"]) {
  for (const invert of [false,true]) {
    const clip=picture(); clip.matte={sourceClipId:"keyhole",mode,invert}; clip.opacity=0.8; clip.blendMode="screen";
    const source={ ...picture(),id:"keyhole",name:"keyhole",hidden:true,mediaType:"shape",opacity:0.7,
      shapeStyle:{kind:"ellipse",...region,fill:mode==="luma" ? "#90b060" : "#ffffff"} };
    delete source.mediaPath;
    save(`matte-${mode}${invert ? "-invert" : ""}`,[source,clip],[0],`track ${mode} matte invert=${invert}, source opacity, layer opacity and blend once`);
  }
}
// Encoded at the picture's source dimensions and frame rate. N is the decoded
// source frame index, so the shape advances even when the sequence is trimmed.
if (!fs.existsSync(`${directory}/moving-matte.mp4`) || process.argv.includes("--regenerate-media")) execFileSync("ffmpeg",["-v","error","-y","-f","lavfi","-i","color=black:s=1280x720:r=30:d=2",
  "-vf","geq=lum='if(between(X,80+N*8,680+N*8)*between(Y,100,620),235,16)':cb=128:cr=128",
  "-c:v","libx264","-crf","0","-pix_fmt","yuv420p",`${directory}/moving-matte.mp4`]);
const moving=picture(); moving.matte={sourceClipId:"keyhole",mode:"luma"};
const source={...picture(),id:"keyhole",name:"keyhole",hidden:true,mediaType:"video",mediaPath:"moving-matte.mp4",
  transform:{position:{x:0.08,y:-0.05},scale:{x:0.8,y:0.8},rotation:0,anchor:{x:0.5,y:0.5}}};
save("matte-moving",[source,moving],[0,21],"moving track luma source with independent placement");
for (const [name,values] of [["generated-matte",{invert:true,featherPx:24}],["generated-matte-strength",{strength:0.45}]]) {
  const clip={...picture(),mediaType:"video",mediaPath:"../../../../fixtures/media/rgb-solid-720p.mp4"};
  clip.opacity=0.8;
  clip.generatedMatte={assetId:"fixture-matte",sourceAssetId:"fixture-picture",sourceRange:{fromMs:0,toMs:2000},
    settings:{},status:"ready",mediaPath:"moving-matte.mp4",...values};
  save(name,[clip],[0,21],`${name} moving video at matched source time`);
}
