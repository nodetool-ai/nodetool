"""Retrieval-readiness check: are the facts an answer needs on each page?

Runs against a local `next start -p 3100`. See retrieval-review.md.
"""
import json, re, urllib.request, html, sys
BASE = "http://localhost:3100"
# (cluster, query, page, [phrases the answer must find on that page])
CASES = [
 ("games","Can an AI agent build a playable game I can keep editing?","/gamedev",["playtests it headlessly","Game Editor","same game document"]),
 ("games","Can Claude Code build a game?","/gamedev",["nodetool mcp install","execute_code","slash commands"]),
 ("games","What is the best open-source AI game engine?","/gamedev/ai-game-engines",["Godot is the most complete open-source engine","NodeTool is open source"]),
 ("games","Which game engines support MCP?","/gamedev/ai-game-engines",["Unity has an MCP server in open beta","Roblox Studio has one built in","Godot has community MCP servers"]),
 ("games","Is NodeTool a Unity or Godot replacement?","/gamedev",["Is NodeTool a replacement for Unity","export to mobile and consoles"]),
 ("games","Can I export a NodeTool game to iOS or Android?","/gamedev",["No iOS, Android, or console export"]),
 ("games","Does NodeTool support 3D games and physics?","/gamedev",["Three.js on WebGL2","Rapier"]),
 ("games","What language are game scripts in?","/gamedev",["JavaScript","QuickJS"]),
 ("games","Generate sprites and music for my game with AI","/gamedev",["sprites","tilesets","music","sound effects"]),
 ("games","Does NodeTool do multiplayer?","/gamedev",["No multiplayer or networking"]),
 ("video","AI video editor with editable timeline","/ai-video-editor",["multi-track timeline","swap a take"]),
 ("video","Can Claude edit a video timeline?","/ai-video-editor",["edit_timeline","render_timeline","nodetool mcp install"]),
 ("video","Keep the same character across AI video shots","/ai-video-editor",["character entity","reference image"]),
 ("video","Change one shot without regenerating everything","/ai-video-editor",["regenerate one shot","keeps its takes"]),
 ("video","Switch between Veo, Kling and Seedance without three subscriptions","/ai-video-editor",["Veo","Kling","Seedance","your own keys"]),
 ("video","Script to storyboard to edit","/ai-video-editor",["storyboard","Create timeline","Voice all lines"]),
 ("video","Export AI edit to Premiere Pro","/ai-video-editor",["Premiere Pro","FCP7 XML"]),
 ("video","Open-source alternative to Runway","/alternatives/runway",["Runway","open"]),
 ("video","Example AI short films with storyboards","/storyboards",["shot"]),
 ("mcp-dev","MCP server for image and video generation in Claude Code","/mcp",["nodetool mcp install","Generate media","Claude Code"]),
 ("mcp-dev","MCP server that edits a video timeline","/mcp",["edit a video timeline","storyboards and timelines"]),
 ("mcp-dev","Cursor MCP image generation","/mcp",["Cursor","nodetool mcp config"]),
 ("mcp-dev","Connect Claude Desktop to local image generation on Mac","/mcp",["Claude Desktop","nodetool mcp config"]),
 ("mcp-dev","Difference between ComfyUI MCP and NodeTool","/mcp",["ComfyUI MCP server runs ComfyUI workflows"]),
 ("mcp-dev","Call AI workflows from CI or a script","/developers",["/api/workflows","nodetool run"]),
 ("mcp-dev","Does the MCP server need the desktop app?","/mcp",["Do I need the desktop app","runs on its own"]),
 ("advertising","Turn product photos into video ads I can edit","/marketing",["product"]),
 ("advertising","Make 9:16, 1:1 and 4:5 versions of an ad","/ai-video-editor",["9:16","1:1","4:5","Adapt format"]),
 ("advertising","AI UGC product video","/recipes/ugc-product-video",["UGC"]),
 ("advertising","AI ad examples to copy","/ad-library",["ad"]),
 ("agentic-category","What is an open-source creative harness for Claude Code?","/agents",["harness"]),
 ("agentic-category","Can I approve each step an AI agent takes?","/agents",["approv"]),
 ("comparison","NodeTool vs ComfyUI","/alternatives/comfyui",["ComfyUI"]),
 ("comparison","NodeTool alternatives and comparisons","/alternatives",["Compare NodeTool","NodeTool vs ComfyUI","AI game engines compared"]),
 ("comparison","NodeTool vs Higgsfield","/alternatives/higgsfield",["Higgsfield"]),
 ("image","Layered AI image editor with masks","/ai-image-editor",["layer"]),
 ("image","Open-source AI image editor that agents can use","/studio",["sketch","layer"]),
]
def text(path, md=False):
    req = urllib.request.Request(BASE+path, headers={"Accept":"text/markdown"} if md else {})
    try:
        with urllib.request.urlopen(req) as r: body=r.read().decode()
    except Exception as e: return None, str(e)
    body = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", body)
    if "<title>Page not found" in body or ">Page not found<" in body: return None, "404"
    t = html.unescape(re.sub(r"<[^>]+>", " ", body))
    return re.sub(r"\s+", " ", t), None
out=[]
cache={}
for cl,q,page,phr in CASES:
    if page not in cache: cache[page]=text(page)
    t,err=cache[page]
    if t is None: out.append((cl,q,page,"Gap",f"page {err}")); continue
    miss=[p for p in phr if p.lower() not in t.lower()]
    v="Answered" if not miss else ("Partial" if len(miss)<len(phr) else "Gap")
    out.append((cl,q,page,v,"missing: "+"; ".join(miss) if miss else "all facts on page"))
if len(sys.argv) > 1:
    json.dump(out, open(sys.argv[1], "w"), indent=1)
for o in out: print(o[3].ljust(9), o[2].ljust(28), o[1][:60], "|", o[4][:80])
