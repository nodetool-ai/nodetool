import json, os, pathlib, subprocess, sys, tempfile, socket, time
with tempfile.TemporaryDirectory() as tmp:
    root=pathlib.Path(tmp)
    document={"id":"game","engine":"native-cpp-1","schemaVersion":4,"dimension":"3d","title":"Editor UI","initialSceneId":"scene","scenes":[{"id":"scene","entities":[{"id":"cube","name":"Cube","visual":{"kind":"primitive","shape":"box"}}]}]}
    path=root/'game.json';path.write_text(json.dumps(document))
    address=str(root/'editor.sock')
    env=dict(os.environ,QT_QPA_PLATFORM='xcb',QSG_RHI_BACKEND='vulkan')
    process=subprocess.Popen([sys.argv[1],str(path),'--socket',address,'--quit-after','2500'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            if pathlib.Path(address).exists(): break
            if process.poll() is not None: break
            time.sleep(.02)
        with socket.socket(socket.AF_UNIX) as connection:
            connection.settimeout(2);connection.connect(address)
            connection.sendall((json.dumps({'requestId':'edit','operation':'transaction','expectedRevision':0,'operations':[{'kind':'setTitle','title':'Agent and UI'}]})+'\n').encode())
            response=json.loads(connection.makefile().readline());assert response['status']=='ok',response
            assert response['result']['revision']==1
        out,err=process.communicate(timeout=10)
        assert process.returncode==0,(out,err)
        assert b'Error:' not in err and b'is not a function' not in err,err
        draft=json.loads(path.with_name('game.json.draft.json').read_text());assert draft['title']=='Agent and UI'
    finally:
        if process.poll() is None: process.kill();process.wait()
print('Native editor QML launch, live socket edit, and draft recovery passed')

# A platform backend request must survive editor startup unchanged.
# The Linux Qt build's default is OpenGL; explicit Vulkan remains covered above.
if sys.platform.startswith('linux'):
    for backend in (None, 'opengl'):
        env=dict(os.environ,QT_QPA_PLATFORM='xcb',QT_LOGGING_RULES='qt.scenegraph.general=true',QT_XCB_GL_INTEGRATION='xcb_egl',LIBGL_ALWAYS_SOFTWARE='1')
        env.pop('QSG_RHI_BACKEND',None)
        if backend is not None: env['QSG_RHI_BACKEND']=backend
        result=subprocess.run([sys.argv[1],'--quit-after','250'],env=env,capture_output=True,timeout=15)
        assert result.returncode==0,(backend,result.stdout,result.stderr)
        assert b'Creating QRhi with backend OpenGL' in result.stderr,(backend,result.stderr)
print('Native editor follows the platform backend and explicit OpenGL request')
