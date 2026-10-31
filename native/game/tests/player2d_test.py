"""Pixel contracts run through the real Qt GPU player and committed Session frame."""
import copy, hashlib, json, os, pathlib, struct, subprocess, sys, tempfile, zlib

def png(width,height,rows):
    def chunk(kind,data): return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\0'+row for row in rows)))+chunk(b'IEND',b'')

def pixels(path):
    raw=path.read_bytes();offset=8;compressed=b''
    while offset<len(raw):
        length=struct.unpack('>I',raw[offset:offset+4])[0];kind=raw[offset+4:offset+8];data=raw[offset+8:offset+8+length];offset+=12+length
        if kind==b'IHDR':
            width,height,depth,color,*_=struct.unpack('>IIBBBBB',data);assert depth==8 and color in (2,6);channels=4 if color==6 else 3
        if kind==b'IDAT': compressed+=data
    decoded=zlib.decompress(compressed);stride=width*channels;previous=bytearray(stride);result=[];offset=0
    for y in range(height):
        mode=decoded[offset];row=bytearray(decoded[offset+1:offset+1+stride]);offset+=stride+1
        for x in range(stride):
            a=row[x-channels] if x>=channels else 0;b=previous[x];c=previous[x-channels] if x>=channels else 0
            if mode==1:row[x]=(row[x]+a)&255
            elif mode==2:row[x]=(row[x]+b)&255
            elif mode==3:row[x]=(row[x]+((a+b)//2))&255
            elif mode==4:
                q=a+b-c;pa,pb,pc=abs(q-a),abs(q-b),abs(q-c);row[x]=(row[x]+(a if pa<=pb and pa<=pc else b if pb<=pc else c))&255
            else: assert mode==0
        result.extend(tuple(row[x:x+channels]) for x in range(0,stride,channels));previous=row
    return result

def sprite(id='sprite',**properties):
    return {'id':id,'name':id,'sprite':{'assetId':'white','width':4,'height':4,**properties}}

binary=str(pathlib.Path(sys.argv[1]).resolve())
with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as directory:
    root=pathlib.Path(directory)
    white=png(1,1,[bytes([255,255,255,255])]);atlas=png(2,1,[bytes([255,0,0,255,0,0,255,255])])
    assets=[]
    for id,data in [('white',white),('atlas',atlas),('alpha',png(2,1,[bytes([0,255,0,255,255,0,0,0])]))]:
        (root/f'{id}.png').write_bytes(data)
        assets.append({'id':id,'kind':'image','digest':hashlib.sha256(data).hexdigest(),'path':f'{id}.png','size':len(data)})
    base={'schemaVersion':5,'engine':'native-cpp-1','dimension':'2d','id':'pixels','title':'2D GPU pixels','initialSceneId':'scene','camera2d':{'width':8,'height':6,'zoom':1},'assets':assets,'scenes':[{'id':'scene','entities':[]}]}
    count=0
    def capture(entities,changes=None,tick=0,restore=False):
        global count
        count+=1;doc=copy.deepcopy(base);doc['scenes'][0]['entities']=entities;doc.update(changes or {})
        path=root/f'{count}.json';path.write_text(json.dumps(doc));image=root/f'{count}.png';report=root/f'{count}-report.json'
        command=[binary,str(path),'--capture',str(image),'--width','640','--height','480','--tick',str(tick),'--report',str(report)]
        if restore:command.append('--verify-restore')
        env={**os.environ,'QSG_RHI_BACKEND':'vulkan'}
        if not env.get('DISPLAY'): command=['xvfb-run','-a',*command]
        result=subprocess.run(command,env=env,capture_output=True,text=True,timeout=60)
        assert result.returncode==0,(count,result.stderr,result.stdout)
        rendered=json.loads(report.read_text());assert rendered['dimension']=='2d' and rendered['committedTick']==tick and rendered['restoreVerified']==restore,rendered
        return pixels(image)
    def at(image,x=320,y=240):return image[y*640+x][:3]
    red=sprite('red',tint='#ff0000',layer=0);blue=sprite('blue',tint='#0000ff',layer=1)
    assert at(capture([blue,red]))==(0,0,255),'layer ordering follows document iteration instead of layer'
    assert at(capture([red,blue]))==(0,0,255),'stable layer rendering'
    blue['sprite']['layer']=0
    assert at(capture([red,blue]))==(0,0,255),'equal layers must preserve authored order'
    blue['sprite']['opacity']=.5
    c=at(capture([red,blue]));assert 120<c[0]<136 and 120<c[2]<136,c
    blue['sprite']['blend']='additive';c=at(capture([red,blue]));assert c[0]>250 and 120<c[2]<136,c
    framed=sprite(assetId='atlas',frame={'x':1,'y':0,'width':1,'height':1})
    assert at(capture([framed]))==(0,0,255),'atlas subrectangle'
    whole=sprite(assetId='atlas');a=capture([whole]);whole['sprite']['flipX']=True;b=capture([whole]);assert at(a,240)==at(b,400)==(255,0,0),'horizontal flip'
    whole['sprite']['flipX']=False
    nearest=capture([whole]);linear=capture([whole],{'assets':[{**a,'sampling':'linear'} for a in assets]})
    assert at(nearest,319) in ((255,0,0),(0,0,255)),at(nearest,319)
    assert 80<at(linear,319)[0]<180 and 80<at(linear,319)[2]<180,at(linear,319)
    alpha=capture([sprite(assetId='alpha')],{'assets':[{**a,'sampling':'linear'} for a in assets]})
    edge=at(alpha,319);assert edge[0]<20 and edge[1]>100,('premultiplied sampling fringe',edge)
    dark={'lighting':{'ambient':{'color':'#ffffff','intensity':0},'points':[]}}
    assert at(capture([sprite()],dark))==(0,0,0),'ambient darkness'
    assert at(capture([sprite(unlit=True)],dark))==(255,255,255),'unlit sprite'
    lit={'lighting':{'ambient':{'color':'#ffffff','intensity':0},'points':[{'x':0,'y':0,'color':'#ff0000','intensity':1,'radius':2,'falloff':1}]}}
    image=capture([sprite()],lit);assert at(image)[0]>240 and at(image)[1]==0 and at(image,470)[0]<30,'point radius/falloff'
    bounded={'lighting':{'ambient':{'color':'#ffffff','intensity':0},'points':[{'x':0,'y':0,'color':'#ffffff','intensity':0,'radius':1,'falloff':1} for _ in range(31)]}}
    near={'id':'near','light2d':{'color':'#ff0000','intensity':1,'radius':2,'falloff':1}}
    far={'id':'far','transform':{'x':100,'y':0},'light2d':{'color':'#0000ff','intensity':4,'radius':1000,'falloff':1}}
    image=capture([sprite(),far,near],bounded);assert at(image)[0]>240 and at(image)[2]==0,'nearest bounded entity light slots'
    entity=sprite(assetId='atlas');entity['animator']={'frames':[{'x':0,'y':0,'width':1,'height':1},{'x':1,'y':0,'width':1,'height':1}],'ticksPerFrame':2,'loop':True}
    first=capture([entity],tick=0);second=capture([entity],tick=2);again=capture([entity],tick=2,restore=True)
    assert at(first)==(255,0,0) and at(second)==(0,0,255) and second==again,'committed animation tick'
    tile={'id':'tiles','tilemap':{'assetId':'atlas','layer':0,'tiles':[{'x':0,'y':0,'width':2,'height':2,'frame':{'x':1,'y':0,'width':1,'height':1}},{'x':100000,'y':0,'width':1,'height':1}]}}
    assert at(capture([tile]))==(0,0,255),'tile atlas and offscreen culling'
    background={'id':'back','assetId':'atlas','width':2,'height':2,'layer':-100,'mode':'repeat','parallax':{'x':0,'y':0},'scrollRate':{'x':0,'y':0}}
    image=capture([] ,{'backgrounds':[background]});assert at(image,80,80) in ((255,0,0),(0,0,255)),'repeating background'
    # A parent transform affects visual placement but remains local in Session frames.
    child=sprite(width=1,height=1,tint='#00ff00');child['parentId']='parent';child['transform']={'x':1,'y':0}
    parent={'id':'parent','transform':{'x':1,'y':0,'rotation':0,'scaleX':1,'scaleY':1}}
    image=capture([parent,child]);assert at(image,480)==(0,255,0),'ancestor transform'
    # Authored facing remains flipped even when its motion faces the natural direction.
    facing=sprite(assetId='atlas',flipX=True,faceMotion='right');facing['body2d']={'type':'kinematic','velocity':{'x':1,'y':0},'gravityScale':0}
    image=capture([facing],tick=1);assert at(image,240)==(0,0,255),'faceMotion discarded authored flip'
    facing['sprite']['flipX']=False;facing['body2d']['velocity']['x']=-1
    image=capture([facing],tick=1);assert at(image,240)==(0,0,255),'faceMotion left turn'
    for mode in ('none','repeat','repeatX','mirror'):
        layer={**background,'mode':mode}
        image=capture([],{'backgrounds':[layer]})
        assert at(image,300,240) in ((255,0,0),(0,0,255)),mode
        outside=at(image,80,80)
        assert (outside!=(18,22,30))==(mode in ('repeat','mirror')),(mode,outside)
    repeated=capture([],{'backgrounds':[{**background,'mode':'repeat'}]})
    mirrored=capture([],{'backgrounds':[{**background,'mode':'mirror'}]})
    assert at(repeated,220)!=at(mirrored,220),'mirror alternation'
    scrolling=capture([],{'backgrounds':[{**background,'scrollRate':{'x':1,'y':0}}]},tick=30)
    assert scrolling!=repeated,'committed background scroll'
    scene={'id':'scene','lighting':{'ambient':{'color':'#ffffff','intensity':0},'points':[]},'backgrounds':[],'entities':[sprite()]}
    image=capture([],{'scenes':[scene],'backgrounds':[background]});assert at(image)==(0,0,0) and at(image,80,80)==(18,22,30),'scene presentation overrides'
    pivotAssets=[{**asset,'pivot':{'x':0,'y':.5}} if asset['id']=='white' else asset for asset in assets]
    image=capture([sprite(width=2,height=2)],{'assets':pivotAssets})
    assert at(image,280)==(18,22,30) and at(image,440)==(255,255,255),'image pivot anchor'
    trimAssets=[{**asset,'trim':{'sourceWidth':2,'sourceHeight':2,'x':0,'y':0}} if asset['id']=='white' else asset for asset in assets]
    image=capture([sprite(width=4,height=4)],{'assets':trimAssets})
    assert at(image,240,160)==(255,255,255) and at(image,400,320)==(18,22,30),'trim canvas geometry'
    visual=sprite(width=4,height=1);visual['behaviors']=[{'id':'visual','scriptId':'visual'}]
    script={'id':'visual','source':"i=>({commands:i.tick===0?[{kind:'setVisual',visual:{rotation:1.5707963267948966,scaleX:0.5,scaleY:1}}]:[]})"}
    image=capture([visual],{'scripts':[script]},tick=1)
    assert at(image,320,180)==(255,255,255) and at(image,420,240)==(18,22,30),'visual rotation and scale override'
    live=copy.deepcopy(base);live['scenes'][0]['entities']=[sprite()];livePath=root/'live.json';livePath.write_text(json.dumps(live))
    liveReport=root/'live-report.json';recording=root/'recording.json'
    command=[binary,str(livePath),'--quit-after','3','--report',str(liveReport),'--record-inputs',str(recording)]
    if not os.environ.get('DISPLAY'):command=['xvfb-run','-a',*command]
    result=subprocess.run(command,env={**os.environ,'QSG_RHI_BACKEND':'vulkan'},capture_output=True,text=True,timeout=30)
    assert result.returncode==0,('2D interactive player',result.stderr)
    assert json.loads(liveReport.read_text())['dimension']=='2d' and len(json.loads(recording.read_text()))>=3,'2D window/input recording'
    # Manifest integrity remains mandatory for raster assets.
    (root/'white.png').write_bytes(atlas)
    bad=copy.deepcopy(base);bad['scenes'][0]['entities']=[sprite()];path=root/'bad.json';path.write_text(json.dumps(bad))
    command=[binary,str(path),'--capture',str(root/'bad.png')]
    if not os.environ.get('DISPLAY'):command=['xvfb-run','-a',*command]
    result=subprocess.run(command,env={**os.environ,'QSG_RHI_BACKEND':'vulkan'},capture_output=True,text=True,timeout=30)
    assert result.returncode!=0 and ('digest' in result.stderr.lower() or 'size' in result.stderr.lower()),result.stderr
print('2D GPU pixel fixtures passed')
