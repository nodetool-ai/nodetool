import { GuestContext } from "../guest/host/context.mjs";
import { CodeNode } from "@nodetool-ai/code-nodes/nodes/code-node";
import { SANDBOX_HOST_MODULES } from "@nodetool-ai/protocol";
const { importHidden } = await import("@nodetool-ai/config");

const cases = [
  [
    "xml",
    ["xml"],
    'import {parse} from "@nodetool-ai/sandbox-xml";return await parse("<root><x>7</x></root>");',
    (value) => value.root.x === "7"
  ],
  [
    "html",
    ["html"],
    'import {toText} from "@nodetool-ai/sandbox-html";return await toText("<p>Hello native</p>");',
    (value) => value === "Hello native"
  ],
  [
    "zip",
    ["zip"],
    'import {zip,unzip} from "@nodetool-ai/sandbox-zip";const files=await unzip(await zip({"a.txt":"roundtrip"}));return new TextDecoder().decode(files["a.txt"]);',
    (value) => value === "roundtrip"
  ],
  [
    "diff",
    ["diff"],
    'import {unified} from "@nodetool-ai/sandbox-diff";return await unified("a\\n","b\\n");',
    (value) => value.includes("-a") && value.includes("+b")
  ],
  [
    "expr",
    ["expr"],
    'import {evaluate} from "@nodetool-ai/sandbox-expr";return await evaluate("x*2+1",{x:20});',
    (value) => value === 41
  ],
  [
    "tokens",
    ["tokens"],
    'import {encode,decode} from "@nodetool-ai/sandbox-tokens";const ids=await encode("hello world");return {count:ids.length,text:await decode(ids)};',
    (value) => value.count === 2 && value.text === "hello world"
  ],
  [
    "xlsx",
    ["xlsx"],
    'import {write,parse} from "@nodetool-ai/sandbox-xlsx";return await parse(await write({Scores:[{name:"Ada",score:42}]}));',
    (value) => value.Scores[0].score === 42 && value.Scores[0].name === "Ada"
  ],
  [
    "docx-mammoth",
    ["docx", "mammoth"],
    'import {build} from "@nodetool-ai/sandbox-docx";import {extractRawText} from "@nodetool-ai/sandbox-mammoth";return await extractRawText(await build({elements:[{type:"paragraph",text:"Round trip content"}]}));',
    (value) => value.includes("Round trip content")
  ],
  [
    "pdf",
    ["pdflib", "pdf"],
    'import {build} from "@nodetool-ai/sandbox-pdflib";import {extractText} from "@nodetool-ai/sandbox-pdf";return await extractText(await build({pages:[{width:200,height:200,items:[{type:"text",x:20,y:20,text:"Hello native PDF",size:14}]}]}));',
    (value) => value.includes("Hello native PDF")
  ],
  [
    "pptx",
    ["pptxgen", "pptx"],
    'import {build} from "@nodetool-ai/sandbox-pptxgen";import {extractText} from "@nodetool-ai/sandbox-pptx";return await extractText(await build({title:"Deck",slides:[{items:[{type:"text",x:1,y:1,w:8,h:1,text:"Hello native slides"}]}]}));',
    (value) => value.includes("Hello native slides")
  ],
  [
    "chrono",
    ["chrono"],
    'import {parseDate} from "@nodetool-ai/sandbox-chrono";return await parseDate("2026-11-07");',
    (value) => String(value).startsWith("2026-11-07")
  ],
  [
    "ics",
    ["ics"],
    'import {createEvent} from "@nodetool-ai/sandbox-ics";return await createEvent({start:[2026,11,7,12,0],duration:{hours:1},title:"Native fixture"});',
    (value) =>
      value.includes("Native fixture") && value.includes("BEGIN:VCALENDAR")
  ],
  [
    "notion",
    ["notion"],
    'import {request,plainText} from "@nodetool-ai/sandbox-notion";const req=await request({token:"fixture",path:"search",method:"POST",body:{query:"needle"}});return {req,text:await plainText([{text:{content:"Native "}},{plain_text:"fixture"}])};',
    (value) =>
      value.req.url === "https://api.notion.com/v1/search" &&
      value.req.headers.Authorization === "Bearer fixture" &&
      JSON.parse(value.req.body).query === "needle" &&
      value.text === "Native fixture"
  ],
  [
    "supabase",
    ["supabase"],
    'import {from,rpc} from "@nodetool-ai/sandbox-supabase";return {table:await from({url:"https://fixture.supabase.co",key:"fixture",table:"items",filters:{score:{gte:42}}}),rpc:await rpc({url:"https://fixture.supabase.co",key:"fixture",fn:"search",args:{q:"x"}})};',
    (value) =>
      value.table.url.includes("score=gte.42") &&
      value.rpc.url.endsWith("/rest/v1/rpc/search") &&
      JSON.parse(value.rpc.body).q === "x"
  ],
  [
    "twilio",
    ["twilio"],
    'import {request} from "@nodetool-ai/sandbox-twilio";return await request({accountSid:"ACfixture",authToken:"fixture",path:"Messages.json",method:"POST",params:{Body:"hello fixture"}});',
    (value) =>
      value.url ===
        "https://api.twilio.com/2010-04-01/Accounts/ACfixture/Messages.json" &&
      value.body === "Body=hello+fixture" &&
      value.headers.Authorization === "Basic QUNmaXh0dXJlOmZpeHR1cmU="
  ],
  [
    "aws",
    ["aws"],
    'import {sigv4,presign} from "@nodetool-ai/sandbox-aws";const req={url:"https://example.amazonaws.com/",service:"service",region:"us-east-1",accessKeyId:"AKIDEXAMPLE",secretAccessKey:"wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"};return {signed:await sigv4(req),url:await presign({...req,expires:60})};',
    (value) =>
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//.test(
        value.signed.headers.Authorization
      ) &&
      /Signature=[a-f0-9]{64}$/.test(value.signed.headers.Authorization) &&
      value.url.includes("X-Amz-Signature=")
  ],
  [
    "subtitle",
    ["subtitle"],
    'import {parse,stringify} from "@nodetool-ai/sandbox-subtitle";return await parse(await stringify([{start:1000,end:2500,text:"Native caption"}]));',
    (value) =>
      value[0].text === "Native caption" &&
      value[0].start === 1000 &&
      value[0].end === 2500
  ],
  [
    "exif",
    ["exif"],
    'import {parse} from "@nodetool-ai/sandbox-exif";const surface=createCanvas(2,2);return {metadata:await parse(await surface.toBytes())};',
    (value) => value.metadata === null || typeof value.metadata === "object"
  ],
  [
    "fabric",
    ["fabric"],
    'import {render,renderSVG,loadSVG} from "@nodetool-ai/sandbox-fabric";const scene={width:8,height:8,objects:[{type:"Rect",left:0,top:0,width:8,height:8,fill:"#ff0000",strokeWidth:0}]};const bytes=await render(scene);return {info:await image.info(bytes),pixel:[...(await image.decode(bytes)).pixels.slice(0,4)],svg:await renderSVG(scene)};',
    (value) =>
      value.info.width === 8 &&
      value.info.height === 8 &&
      JSON.stringify(value.pixel) === "[255,0,0,255]" &&
      value.svg.includes("<rect")
  ],
  [
    "epub",
    ["zip", "epub"],
    'import {zip} from "@nodetool-ai/sandbox-zip";import {metadata,extractText,extractChapters,tableOfContents} from "@nodetool-ai/sandbox-epub";const bytes=await zip(inputs.files);return {metadata:await metadata(bytes),text:await extractText(bytes),chapters:await extractChapters(bytes),toc:await tableOfContents(bytes)};',
    (value) =>
      value.metadata.title === "Native book" &&
      value.text === "Native chapter Archive text." &&
      value.chapters[0].title === "First chapter" &&
      value.toc[0].order === 1
  ]
];
const results = [];
for (const [id, kinds, body, verify] of cases) {
  try {
    const context = new GuestContext();
    context.sandboxModuleCatalog = {
      resolveForExecution: () => ({
        statuses: [],
        modules: kinds.map((hostId) => {
          const spec = SANDBOX_HOST_MODULES[hostId];
          return {
            kind: "host",
            hostId,
            specifier: spec.packName,
            packName: spec.packName,
            moduleId: hostId,
            graph: []
          };
        })
      })
    };
    const code = new CodeNode();
    code.code = body;
    code.timeout = 20;
    if (id === "epub")
      code.dynamicProps.set("files", {
        mimetype: "application/epub+zip",
        "META-INF/container.xml":
          '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
        "OPS/book.opf":
          '<package><metadata><dc:title xmlns:dc="urn:dc">Native book</dc:title></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="toc"><itemref idref="chapter"/></spine></package>',
        "OPS/toc.ncx":
          '<ncx><navMap><navPoint id="start" playOrder="1"><navLabel><text>First chapter</text></navLabel><content src="chapter.xhtml"/></navPoint></navMap></ncx>',
        "OPS/chapter.xhtml":
          "<html><body><h1>Native chapter</h1><p>Archive text.</p></body></html>"
      });
    const outputs = await code.process(context);
    const result =
      Object.keys(outputs).length === 1 && Object.hasOwn(outputs, "output")
        ? outputs.output
        : outputs;
    if (!verify(result))
      throw new Error(`Unexpected actual result: ${JSON.stringify(result)}`);
    results.push({ id, ok: true });
  } catch (error) {
    results.push({ id, ok: false, error: String(error) });
  }
}
globalThis.__host.log("info", "G5_HOST_PACKAGES " + JSON.stringify(results));
globalThis.__g5HostPackages = results;
if (results.some((result) => !result.ok))
  throw new Error(
    "Native Code host-package regressions: " +
      JSON.stringify(results.filter((result) => !result.ok))
  );
globalThis.__g5Result.hostPackages = results.length;

const tf = await importHidden("@tensorflow/tfjs");
await tf.setBackend("cpu");
await tf.ready();
const tensor = tf.tensor3d(
  new Uint8Array([1, 2, 3, 4, 5, 6]),
  [1, 2, 3],
  "int32"
);
const summed = tensor.sum();
if ((await summed.data())[0] !== 21)
  throw new Error("Actual TensorFlow CPU kernel output differs");
summed.dispose();
tensor.dispose();
globalThis.__g5Result.tensorFlowCpu = true;

const tfContext = new GuestContext();
tfContext.sandboxModuleCatalog = {
  resolveForExecution: () => ({
    statuses: [],
    modules: [
      {
        kind: "host",
        hostId: "tfjs",
        specifier: "@nodetool-ai/sandbox-tfjs",
        packName: "@nodetool-ai/sandbox-tfjs",
        moduleId: "tfjs",
        graph: []
      }
    ]
  })
};
const deniedModels = [];
for (const operation of ["classify", "embed", "detect", "answer"]) {
  const code = new CodeNode();
  code.timeout = 30;
  code.code =
    operation === "answer"
      ? `import {answer} from "@nodetool-ai/sandbox-tfjs";return await answer("Who?","Ada wrote the note.");`
      : `import {${operation}} from "@nodetool-ai/sandbox-tfjs";const surface=createCanvas(4,4);return await ${operation}(await surface.toBytes());`;
  try {
    await code.process(tfContext);
    throw new Error("Ungrant model weights accepted");
  } catch (error) {
    if (!String(error).includes("HTTP resource is not granted")) throw error;
    deniedModels.push({ operation, error: String(error) });
  }
}
globalThis.__host.log(
  "info",
  "G5_MODEL_RESOURCES " + JSON.stringify(deniedModels)
);
globalThis.__g5Result.modelResourceGrants = deniedModels.length;
