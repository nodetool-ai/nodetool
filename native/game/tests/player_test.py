import json, os, pathlib, subprocess, sys, tempfile
import struct, zlib
def pixels(path):
    raw=path.read_bytes(); offset=8; compressed=b""
    while offset<len(raw):
        length=struct.unpack(">I",raw[offset:offset+4])[0];kind=raw[offset+4:offset+8];data=raw[offset+8:offset+8+length];offset+=12+length
        if kind==b"IHDR":
            width,height,depth,color,*_=struct.unpack(">IIBBBBB",data);assert depth==8 and color in (2,6);channels=4 if color==6 else 3
        if kind==b"IDAT": compressed+=data
    decoded=zlib.decompress(compressed);stride=width*channels;previous=bytearray(stride);result=[];offset=0
    for y in range(height):
        mode=decoded[offset];row=bytearray(decoded[offset+1:offset+1+stride]);offset+=stride+1
        for x in range(stride):
            a=row[x-channels] if x>=channels else 0;b=previous[x];c=previous[x-channels] if x>=channels else 0
            if mode==1: row[x]=(row[x]+a)&255
            elif mode==2: row[x]=(row[x]+b)&255
            elif mode==3: row[x]=(row[x]+((a+b)//2))&255
            elif mode==4:
                q=a+b-c;pa,pb,pc=abs(q-a),abs(q-b),abs(q-c);row[x]=(row[x]+(a if pa<=pb and pa<=pc else b if pb<=pc else c))&255
            else: assert mode==0
        result.extend(tuple(row[x:x+channels]) for x in range(0,stride,channels));previous=row
    return result
binary = pathlib.Path(sys.argv[1]).resolve()
fixture = {"schemaVersion":4,"engine":"native-cpp-1","dimension":"3d","id":"1"*32,"title":"Capture fixture","revision":0,"inputActions":[{"id":"jump","bindings":["Space"]}],"initialSceneId":"scene","scenes":[{"id":"scene","name":"Scene","entities":[{"id":"box","name":"Box","visual":{"kind":"primitive","shape":"box","color":[1,0.2,0.1,1],"size":[2,2,2]}}]}],"hud":[{"id":"label","kind":"button","text":"Tick {tick}","action":"jump","bounds":[0.05,0.05,0.3,0.12]}]}
with tempfile.TemporaryDirectory() as directory:
    root=pathlib.Path(directory);doc=root/'game.json';doc.write_text(json.dumps(fixture));env=dict(os.environ)
    env.setdefault('QSG_RHI_BACKEND','vulkan')
    results=[]
    for index in range(2):
        image=root/f'{index}.png';report=root/f'{index}.json'
        command=[str(binary),str(doc),'--capture',str(image),'--tick','5','--report',str(report)]
        if not env.get('DISPLAY') and sys.platform.startswith('linux'): command=['xvfb-run','-a',*command]
        result=subprocess.run(command,env=env,capture_output=True,text=True,timeout=60)
        assert result.returncode==0, f"exit {result.returncode}: {result.stderr} {result.stdout}"
        data=json.loads(report.read_text());assert data['committedTick']==5,data;assert data['vertices']>0,data;assert data['device'],data
        results.append(pixels(image))
    assert results[0]==results[1], 'exact tick capture changed'
    colors=set(results[0]);assert len(colors)>10,'capture contains no geometry/HUD'
    assert results[0][40*640+40] != results[0][0], 'HUD not drawn in capture'
    live_report=root/'live.json';recording=root/'inputs.json'
    live=[str(binary),str(doc),'--quit-after','5','--report',str(live_report),'--record-inputs',str(recording)]
    if not env.get('DISPLAY') and sys.platform.startswith('linux'):live=['xvfb-run','-a',*live]
    result=subprocess.run(live,env=env,capture_output=True,text=True,timeout=30)
    assert result.returncode==0,f'live exit {result.returncode}: {result.stderr}'
    assert json.loads(live_report.read_text())['vertices']>0,'live player did not render'
    assert len(json.loads(recording.read_text()))>=5,'live input frames not recorded'


# A self-contained skinned glTF exercises the renderer rather than merely testing
# asset admission. Its joint translates at committed time; the texture has two
# colors, and the moving triangle casts onto a separate floor receiver.
import hashlib

def png(width,height,rows):
    def chunk(kind,data): return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\0'+row for row in rows)))+chunk(b'IEND',b'')

def animated_model():
    payload=bytearray();views=[];accessors=[]
    def append(data):
        while len(payload)%4: payload.append(0)
        start=len(payload);payload.extend(data);views.append({'buffer':0,'byteOffset':start,'byteLength':len(data)});return len(views)-1
    def accessor(values,fmt,component,kind,count):
        index=append(struct.pack('<'+fmt,*values));accessors.append({'bufferView':index,'componentType':component,'count':count,'type':kind});return len(accessors)-1
    pos=accessor([-1,0,0,1,0,0,0,2,0],'9f',5126,'VEC3',3)
    normal=accessor([0,0,1]*3,'9f',5126,'VEC3',3)
    uv=accessor([0,1,1,1,.5,0],'6f',5126,'VEC2',3)
    joints=accessor([0,0,0,0]*3,'12H',5123,'VEC4',3)
    weights=accessor([1,0,0,0]*3,'12f',5126,'VEC4',3)
    indices=accessor([0,1,2],'3H',5123,'SCALAR',3)
    times=accessor([0,1],'2f',5126,'SCALAR',2)
    translation=accessor([0,0,0,2,0,0],'6f',5126,'VEC3',2)
    image=append(png(2,2,[bytes([255,0,0,255,0,0,255,255])]*2))
    gltf={'asset':{'version':'2.0'},'buffers':[{'byteLength':len(payload)}],'bufferViews':views,'accessors':accessors,
          'images':[{'bufferView':image,'mimeType':'image/png'}],'textures':[{'source':0}],
          'materials':[{'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'baseColorTexture':{'index':0}}}],
          'meshes':[{'primitives':[{'attributes':{'POSITION':pos,'NORMAL':normal,'TEXCOORD_0':uv,'JOINTS_0':joints,'WEIGHTS_0':weights},'indices':indices,'material':0}]}],
          'nodes':[{'mesh':0,'skin':0},{}],'skins':[{'joints':[1]}],'scenes':[{'nodes':[0,1]}],'scene':0,
          'animations':[{'samplers':[{'input':times,'output':translation,'interpolation':'LINEAR'}],'channels':[{'sampler':0,'target':{'node':1,'path':'translation'}}]}]}
    encoded=json.dumps(gltf,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);payload+=b'\0'*((-len(payload))%4)
    return struct.pack('<III',0x46546c67,2,12+8+len(encoded)+8+len(payload))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(payload),0x004e4942)+payload

with tempfile.TemporaryDirectory() as directory:
    root=pathlib.Path(directory);model=animated_model();(root/'model.glb').write_bytes(model)
    fixture['assets']=[{'id':'model','kind':'model','digest':hashlib.sha256(model).hexdigest(),'path':'model.glb','size':len(model),'dependencies':[]}]
    fixture['camera']={'position':[0,3,8],'target':[0,1,0],'fov':60};fixture['hud']=[]
    floor={'id':'floor','name':'Floor','transform':{'position':[0,-.1,0]},'visual':{'kind':'primitive','shape':'box','size':[10,.2,10],'color':[1,1,1,1]}}
    actor={'id':'animated','name':'Animated','visual':{'kind':'model','assetId':'model'}}
    captures=[]
    for tick in (0,30):
        fixture['scenes'][0]['entities']=[floor,actor];doc=root/'game.json';doc.write_text(json.dumps(fixture));image=root/f'model-{tick}.png'
        command=[str(binary),str(doc),'--capture',str(image),'--tick',str(tick),'--assets-dir',str(root)]
        if not os.environ.get('DISPLAY') and sys.platform.startswith('linux'):command=['xvfb-run','-a',*command]
        result=subprocess.run(command,env={**os.environ,'QSG_RHI_BACKEND':'vulkan'},capture_output=True,text=True,timeout=60)
        assert result.returncode==0,f'{result.returncode}: {result.stderr}'
        report=json.loads(result.stdout);assert report['shadowMapSize']==1024 and report['vertices']>=39,report
        captures.append(pixels(image))
    assert sum(a!=b for a,b in zip(*captures))>100,'skeletal animation did not change captured pixels'
    assert any(p[0]>p[2]*2 and p[0]>50 for p in captures[0]),'red texture region absent'
    assert any(p[2]>p[0]*2 and p[2]>50 for p in captures[0]),'blue texture region absent'
    fixture['scenes'][0]['entities']=[floor];doc.write_text(json.dumps(fixture));baseline=root/'floor.png';command=[str(binary),str(doc),'--capture',str(baseline),'--assets-dir',str(root)]
    if not os.environ.get('DISPLAY') and sys.platform.startswith('linux'):command=['xvfb-run','-a',*command]
    result=subprocess.run(command,env={**os.environ,'QSG_RHI_BACKEND':'vulkan'},capture_output=True,text=True,timeout=60);assert result.returncode==0,result.stderr
    base=pixels(baseline)
    shadow_pixels=sum(1 for index,(a,b) in enumerate(zip(captures[0],base)) if b[0]>100 and a[0]<b[0]*.8 and abs(a[0]-a[2])<10)
    assert shadow_pixels>20,f'no floor shadow pixels: {shadow_pixels}'

# The real player consumes a script-generated audio event and writes a non-silent
# offline mix, independently of an installed sound device.
import io, math, wave
with tempfile.TemporaryDirectory() as directory:
    root=pathlib.Path(directory);output=io.BytesIO()
    with wave.open(output,'wb') as audio:
        audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(48000)
        audio.writeframes(struct.pack('<4800h',*(int(12000*math.sin(i*2*math.pi*440/48000)) for i in range(4800))))
    tone=output.getvalue();(root/'tone.wav').write_bytes(tone)
    fixture['assets']=[{'id':'tone','kind':'audio','digest':hashlib.sha256(tone).hexdigest(),'path':'tone.wav','size':len(tone),'dependencies':[]}]
    fixture['scripts']=[{'id':'play','source':"i=>({commands:i.tick===0?[{kind:'audio',assetId:'tone',volume:1,loop:false,bus:'sfx',music:false}]:[]})"}]
    fixture['scenes'][0]['entities']=[{'id':'sound','name':'Sound','behaviors':[{'id':'update','scriptId':'play'}]}]
    doc=root/'game.json';doc.write_text(json.dumps(fixture));wav=root/'mix.wav';image=root/'audio.png'
    command=[str(binary),str(doc),'--capture',str(image),'--tick','5','--assets-dir',str(root),'--audio-capture',str(wav)]
    if not os.environ.get('DISPLAY') and sys.platform.startswith('linux'):command=['xvfb-run','-a',*command]
    result=subprocess.run(command,env={**os.environ,'QSG_RHI_BACKEND':'vulkan'},capture_output=True,text=True,timeout=60)
    assert result.returncode==0,result.stderr
    with wave.open(str(wav),'rb') as audio:
        raw=audio.readframes(audio.getnframes());assert any(raw),'player offline audio mix is silent'
