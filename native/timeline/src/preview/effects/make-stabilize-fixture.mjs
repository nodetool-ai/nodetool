import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { writeRgbaVideo } from "@nodetool-ai/runtime/media/testing";
import { stabilizationCurve } from "@nodetool-ai/timeline/render";

const directory=fileURLToPath(new URL("./fixtures/",import.meta.url));
const width=160,height=96,fps=30,count=60;
const background=seed => {
  const values=new Uint8Array(width*height);
  for (let i=0;i<values.length;i++) { seed=(Math.imul(seed,1664525)+1013904223)>>>0; values[i]=48+(seed>>>25); }
  return values;
};
const shots=[background(19),background(731)];
const path=[];
await writeRgbaVideo({outPath:`${directory}/source-jitter.mp4`,width,height,fps,frames:count,
  spec:{codec:"libx264",pixelFormat:"yuv420p",options:{crf:"0",preset:"ultrafast",bf:"0"}},
  frameAt:index => {
    const dx=[2,-2,1,-1][index%4],dy=[1,-1,-1,1][index%4],shot=index<30 ? 0 : 1;
    path.push({timeMs:index*1000/fps,x:dx/width,y:dy/width,angle:0,logScale:0,cut:index===30});
    const frame=new Uint8Array(width*height*4);
    for (let y=0;y<height;y++) { for (let x=0;x<width;x++) {
      const value=shots[shot][Math.max(0,Math.min(height-1,y-dy))*width+Math.max(0,Math.min(width-1,x-dx))];
      const foreground=x>=65+index%10 && x<81+index%10 && y>=40 && y<52;
      frame.set(foreground ? [240,240,240,255] : shot ? [value/2,value/2,value,255] : [value,value,value,255],(y*width+x)*4);
    } }
    return frame;
  }
});
const analysis={version:1,kind:"stabilize",source:{assetId:"",mediaPath:"source-jitter.mp4"},rangeStartMs:0,rangeEndMs:2000,
  frameRate:fps,windowMs:500,width,height,trackedFrames:58,...stabilizationCurve(path,500,height/width)};
const document={id:"seq-clip-stabilize",projectId:"native-prototype",name:"clip-stabilize",fps,width,height,durationMs:2000,
  tracks:[{id:"t0",name:"Video",type:"video",index:0,visible:true,locked:false}],
  clips:[{id:"stabilize",trackId:"t0",name:"Stabilization",startMs:0,durationMs:2000,inPointMs:0,
    mediaType:"video",sourceType:"imported",status:"generated",locked:false,versions:[],width,height,mediaPath:"source-jitter.mp4",
    effects:[{id:"stabilize",type:"stabilize",enabled:true,analysis}]}],markers:[],
  createdAt:"2026-10-24T00:00:00.000Z",updatedAt:"2026-10-24T00:00:00.000Z",
  goldenFrames:[10,11,30,31,50].map(frame=>({frame,criterion:"F56 saved camera correction, cut isolation and deterministic seeking, PSNR >= 40 dB"}))};
fs.writeFileSync(`${directory}/clip-stabilize.json`,JSON.stringify(document,null,2)+"\n");
