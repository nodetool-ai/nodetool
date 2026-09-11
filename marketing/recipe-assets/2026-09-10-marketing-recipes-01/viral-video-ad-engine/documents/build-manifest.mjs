import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const db = "/Users/mg/.local/share/nodetool/nodetool.sqlite3";
const projectId = "default";
const projectName = "Marketing recipes / viral-video-ad-engine / 2026-09-10-marketing-recipes-01";
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});
const mime = (p) => ({".json":"application/json",".md":"text/markdown",".txt":"text/plain",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp",".mp4":"video/mp4",".webm":"video/webm",".mp3":"audio/mpeg",".wav":"audio/wav",".vtt":"text/vtt",".mjs":"text/javascript"}[path.extname(p).toLowerCase()] ?? "application/octet-stream");
const probe = (p) => {
  if (!/\.(png|jpe?g|webp|mp4|webm|mp3|wav)$/i.test(p)) return {};
  try {
    const x = JSON.parse(execFileSync("ffprobe", ["-v","error","-show_streams","-show_format","-of","json",p], { encoding: "utf8" }));
    const v = x.streams?.find((s) => s.codec_type === "video");
    const a = x.streams?.find((s) => s.codec_type === "audio");
    const still = /\.(png|jpe?g|webp)$/i.test(p);
    const fps = !still && v?.r_frame_rate?.includes("/") ? (() => { const [n,d]=v.r_frame_rate.split("/").map(Number); return d ? n/d : null; })() : null;
    const duration = still ? NaN : Number(x.format?.duration ?? v?.duration ?? a?.duration);
    return { width: v?.width ?? null, height: v?.height ?? null, durationSeconds: Number.isFinite(duration) ? duration : null, fps, hasAudio: Boolean(a), alphaStatus: v ? (/a/.test(v.pix_fmt ?? "") ? "present" : "none") : null };
  } catch { return { probeError: true }; }
};
const rel = (p) => path.relative(root, p).split(path.sep).join("/");
const sourceIdsFor = (r) => {
  const sharedClips = ["c52bae64a4634aea81786c7e04bb802f","56373aa8fb5c4472a66abbec798c5f81","4c0fb8f4afb94d9d8825eaeb60170fd0"];
  const voice = ["70faf487d76145a8861320aa1bf8296e","00e4538ee63a4321a6d79d962576d4c6","fa37af2c8f3346cf928b3657bc7db268"];
  const stills = {"ad-s1a":"97ad5c454b594241a866c3be4373c630","ad-s1b":"12a46edf3f604b678c5b4ace6bb415f9","ad-s1c":"b33d24ef33da499197d62af85c95edc2","ad-s2":"11a5b5aa101747a19feb223a12e3d8d9","ad-s3":"cfe6efc8a35b4636b04a4e7b9a2fa3e3","ad-s4":"aaeb7dceaabe46eabd65309c8d0f5de1"};
  const clips = {"ad-s1a":"6417ad9304c9469eaf38929cc3d37cd6","ad-s1b":"4676695df4774947b2f964a85ebb6a19","ad-s1c":"6766c8ae46b94aca8f93b7f218ba99a9","ad-s2":"c52bae64a4634aea81786c7e04bb802f","ad-s3":"56373aa8fb5c4472a66abbec798c5f81","ad-s4":"4c0fb8f4afb94d9d8825eaeb60170fd0"};
  if (/ad-a/.test(r) && /masters|web\//.test(r)) return ["6417ad9304c9469eaf38929cc3d37cd6",...sharedClips,"189f8e05afec4e0ba5a9c0afc40d5fd2",...voice];
  if (/ad-b/.test(r) && /masters|web\//.test(r)) return ["4676695df4774947b2f964a85ebb6a19",...sharedClips,"d4a67b2fa36c453d85ed8acbdf789e1f",...voice];
  if (/ad-c/.test(r) && /masters|web\//.test(r)) return ["6766c8ae46b94aca8f93b7f218ba99a9",...sharedClips,"a7083f34b1f74387b15dc52ef488cca8",...voice];
  const shot = r.match(/ad-s(?:1[abc]|[234])/i)?.[0].toLowerCase();
  if (shot && r.startsWith("selects/")) return [r.includes("-clip.") ? clips[shot] : stills[shot]];
  if (shot && r.startsWith("generation/") && r.includes("clip-original")) return [r.includes("retry-1") ? stills[shot] : ({"ad-s1c":"e2e452f34214499f80e7d6d5fbd6b1fd","ad-s4":"aea2a5bf7ed745379fe564bbb804f4f3"}[shot] ?? stills[shot])];
  if (shot && r.startsWith("generation/")) return ["382922e1ca1543468d59f0af5575350e"];
  return [];
};
const requiredPath = (p) => {
  const r = rel(p);
  return ["capture-log.json","handoff.md","qa.md","documents/ad-copy.md","evidence/ffprobe.json","evidence/product-consistency.webp","evidence/sha256.txt","evidence/variant-reuse.json","web/hooks-contact-sheet.webp","web/recipe-card.webp","web/social-preview.webp"].includes(r)
    || /^documents\/(production-board|script-[abc]|timeline-[abc])\.json$/.test(r)
    || /^selects\/ad-s(1[abc]|[234])(?:-clip\.mp4|\.png)$/.test(r)
    || /^masters\/ad-[abc]-(clean|captioned)\.mp4$/.test(r)
    || /^web\/(ad-[abc]\.(mp4|webm|vtt)|ad-[abc]-poster\.webp|thumbnail-[abc]\.webp)$/.test(r)
    || /^voice\/(original\/(hook_[abc]|shared_[123])\.mp3|stems\/(hook_[abc]|shared_[123])_48k\.wav)$/.test(r)
    || /^generation\/ad-s(1[abc]|[234])(?:-retry-1)?(?:-clip-original\.mp4|-original\.jpg)$/.test(r);
};
const files0 = walk(root).filter((p) => requiredPath(p) && !p.endsWith("evidence/sha256.txt"));
fs.writeFileSync(path.join(root,"evidence/sha256.txt"), files0.map((p) => `${sha(p)}  ${rel(p)}`).sort().join("\n")+"\n");
const files = walk(root).filter(requiredPath);
const assets = files.map((p) => {
  const r = rel(p); const st = fs.statSync(p); const q = probe(p);
  const generated = r.startsWith("generation/") || r.startsWith("voice/original/");
  const derived = r.startsWith("selects/") || r.startsWith("masters/") || r.startsWith("web/") || r.startsWith("evidence/") || r.startsWith("voice/stems/");
  const shot = r.match(/ad-s(?:1[abc]|[234])/i)?.[0].toUpperCase() ?? null;
  const timeline = /ad-a/.test(r) ? "ecaf4b138411428e83d8071bc2a7cdcb" : /ad-b/.test(r) ? "58d280ee969c41448fcb09b6891ee0ab" : /ad-c/.test(r) ? "c80736b7dff447d4bb21789f95a438ea" : null;
  return { stableId:`D1-${r.replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-|-$/g,"")}`, role:r.split("/")[0], relativePath:r, sha256:sha(p), mimeType:mime(p), bytes:st.size, width:q.width ?? null, height:q.height ?? null, durationSeconds:q.durationSeconds ?? null, fps:q.fps ?? null, hasAudio:q.hasAudio ?? null, alphaStatus:q.alphaStatus ?? null, sourceIds:sourceIdsFor(r), producingDocument:timeline ?? (shot ? "af795795297f43bf9e66d0318f422c83" : null), shotOrLineIds:shot ? [shot] : null, provenance:generated ? "generated-source" : derived ? "derived" : "generated-in-nodetool", transformation:derived ? "Selected copy, deterministic conversion, assembly, encode, probe, or evidence export; see role and sourceIds." : null };
});

const docDefs = [
  ["production-board","storyboard","af795795297f43bf9e66d0318f422c83","documents/production-board.json",["58f7b179a7d74d989a650f52a3ce8ff5"]],
  ["script-a","script","58f7b179a7d74d989a650f52a3ce8ff5","documents/script-a.json",["af795795297f43bf9e66d0318f422c83","ecaf4b138411428e83d8071bc2a7cdcb"]],
  ["script-b","script","c487fa64f3504e1abf56b3408603db46","documents/script-b.json",["58d280ee969c41448fcb09b6891ee0ab"]],
  ["script-c","script","5f1a06467b01420591e2d3c4d31d6fea","documents/script-c.json",["c80736b7dff447d4bb21789f95a438ea"]],
  ["timeline-a","timeline","ecaf4b138411428e83d8071bc2a7cdcb","documents/timeline-a.json",["58f7b179a7d74d989a650f52a3ce8ff5","af795795297f43bf9e66d0318f422c83"]],
  ["timeline-b","timeline","58d280ee969c41448fcb09b6891ee0ab","documents/timeline-b.json",["c487fa64f3504e1abf56b3408603db46","af795795297f43bf9e66d0318f422c83"]],
  ["timeline-c","timeline","c80736b7dff447d4bb21789f95a438ea","documents/timeline-c.json",["5f1a06467b01420591e2d3c4d31d6fea","af795795297f43bf9e66d0318f422c83"]]
];
const documents = docDefs.map(([role,type,serverId,exportPath,linkedDocumentIds]) => ({ role, documentType:type, serverId, projectId, projectName, exportPath, sha256:sha(path.join(root,exportPath)), linkedDocumentIds }));

const generated = [
  ["97ad5c454b594241a866c3be4373c630","AD-S1A",["382922e1ca1543468d59f0af5575350e"],1,"documents/production-board.json"],["11a5b5aa101747a19feb223a12e3d8d9","AD-S2",["382922e1ca1543468d59f0af5575350e"],1,"documents/production-board.json"],["cfe6efc8a35b4636b04a4e7b9a2fa3e3","AD-S3",["382922e1ca1543468d59f0af5575350e"],1,"documents/production-board.json"],["aea2a5bf7ed745379fe564bbb804f4f3","AD-S4",["382922e1ca1543468d59f0af5575350e"],1,"documents/production-board.json"],["12a46edf3f604b678c5b4ace6bb415f9","AD-S1B",["382922e1ca1543468d59f0af5575350e"],1,"documents/production-board.json"],["e2e452f34214499f80e7d6d5fbd6b1fd","AD-S1C",["382922e1ca1543468d59f0af5575350e"],1,"documents/production-board.json"],
  ["6417ad9304c9469eaf38929cc3d37cd6","AD-S1A",["97ad5c454b594241a866c3be4373c630"],1,"documents/production-board.json"],["c52bae64a4634aea81786c7e04bb802f","AD-S2",["11a5b5aa101747a19feb223a12e3d8d9"],1,"documents/production-board.json"],["56373aa8fb5c4472a66abbec798c5f81","AD-S3",["cfe6efc8a35b4636b04a4e7b9a2fa3e3"],1,"documents/production-board.json"],["ee65d76644bc498fbdeb144ceb8e9710","AD-S4",["aea2a5bf7ed745379fe564bbb804f4f3"],1,"documents/production-board.json"],["4676695df4774947b2f964a85ebb6a19","AD-S1B",["12a46edf3f604b678c5b4ace6bb415f9"],1,"documents/production-board.json"],["bf9df475b96049a2a4b5d33c183669c1","AD-S1C",["e2e452f34214499f80e7d6d5fbd6b1fd"],1,"documents/production-board.json"],
  ["aaeb7dceaabe46eabd65309c8d0f5de1","AD-S4",["382922e1ca1543468d59f0af5575350e"],2,"documents/executor-objective-7.md"],["b33d24ef33da499197d62af85c95edc2","AD-S1C",["382922e1ca1543468d59f0af5575350e"],2,"documents/executor-objective-7.md"],["4c0fb8f4afb94d9d8825eaeb60170fd0","AD-S4",["aaeb7dceaabe46eabd65309c8d0f5de1"],2,"documents/executor-objective-8.md"],["6766c8ae46b94aca8f93b7f218ba99a9","AD-S1C",["b33d24ef33da499197d62af85c95edc2"],2,"documents/executor-objective-8.md"],
  ["189f8e05afec4e0ba5a9c0afc40d5fd2","AD-L1-A",[],1,"documents/ad-copy.md"],["d4a67b2fa36c453d85ed8acbdf789e1f","AD-L1-B",[],1,"documents/ad-copy.md"],["a7083f34b1f74387b15dc52ef488cca8","AD-L1-C",[],1,"documents/ad-copy.md"],["70faf487d76145a8861320aa1bf8296e","AD-L2",[],1,"documents/ad-copy.md"],["00e4538ee63a4321a6d79d962576d4c6","AD-L3",[],1,"documents/ad-copy.md"],["fa37af2c8f3346cf928b3657bc7db268","AD-L4",[],1,"documents/ad-copy.md"]
];
const ids = generated.map((x)=>`'${x[0]}'`).join(",");
const rows = JSON.parse(execFileSync("sqlite3", ["-json",db,`select id,job_id,metadata from nodetool_assets where id in (${ids});`], {encoding:"utf8"}));
const byId = new Map(rows.map((r)=>[r.id,r]));
const generationCalls = generated.map(([id,shotOrLineId,inputAssetIds,attemptNumber,promptFile]) => {
  const row=byId.get(id); const meta=JSON.parse(row?.metadata ?? "{}"); const g=meta.generation ?? {}; const toolName=g.capability === "image_to_image" ? "edit_image" : g.capability === "image_to_video" ? "animate_image" : "generate_speech";
  return { callJobId:row?.job_id ?? null, generationId:meta.generation_id ?? null, toolName, provider:g.provider ?? "fal_ai", model:g.model ?? null, inputAssetIds, promptFile, generationSettings:g.params ?? {}, outputIds:[id], shotOrLineId, actualCost:null, currency:null, attemptNumber, failureReason:null };
});

const manifest = {
  schemaVersion:1, runId:"2026-09-10-marketing-recipes-01", recipeSlug:"viral-video-ad-engine", status:"partial", documents, assets, generationCalls,
  blockedItems:[{requiredAssetId:"AD-A13",attemptedOperation:"AD-C0 through AD-C11 live UI capture",observedLimitation:"No capture files were produced.",availablePartialResult:"capture-log.json contains the exact ordered capture plan and document IDs.",exactNextAction:"Capture AD-C0 through AD-C11 in order and save PNG/WebP files at the logged paths."},{requiredAssetId:"AD-A14",attemptedOperation:"Guided-flow walkthrough recording",observedLimitation:"No walkthrough file was produced.",availablePartialResult:"Playable finished ads and reopenable document IDs are ready.",exactNextAction:"Record and edit the 35–60 second walkthrough plus WebM, VTT, and poster."}],
  supportedClaims:[{wording:"Create three editable 15-second product-ad variants with different openings and shared remaining footage.",evidenceIds:["timeline-a","timeline-b","timeline-c","evidence/variant-reuse.json"],limitation:"Describes this local production run, not generation speed or performance.",safeToUse:true},{wording:"The ads use the same accepted Olive Travel Cup reference across all six shots.",evidenceIds:["evidence/product-consistency.webp","production-board"],limitation:"Fictional unbranded demonstration product.",safeToUse:true},{wording:"FAL generated the stills, motion clips, and voice used in this package through NodeTool.",evidenceIds:generationCalls.map((g)=>g.generationId).filter(Boolean),limitation:"Actual provider cost was unavailable and remains null.",safeToUse:true}]
};
fs.writeFileSync(path.join(root,"asset-manifest.json"), JSON.stringify(manifest,null,2)+"\n");
