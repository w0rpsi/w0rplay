"""Pack a local Wolli Grey Danish Pluche compatibility patch; never modify the base archive.

Requires the converted local model and the installed Wolli mod. The material
pattern and rail derive from that installed mod; this is a local compatibility
build, separate from W0RPLAY's original front-curtain source/package.
"""
from pathlib import Path
import os
import hashlib
import json
import re
import struct
import zipfile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT/'tools/vendor/conversion-tools/rsrc/base/@cache'
BASE = Path(os.environ['W0RPLAY_WOLLI_MOD'])  # Path to the user's own Wolli archive.
OUTPUT = ROOT/'mods/w0rplay-wolli-curtains/w0rplay_wolli_curtains.scs'
MODEL = 'model/w0rplay/wolli_curtains/w0r_wolli'
EXTERIOR = MODEL+'_ext'
TEXTURE = 'material/w0rplay/wolli_curtains/poses'
WIDTH, HEIGHT, TILE, COLUMNS, POSES = 1032,1032,256,4,16
MAGIC = bytes([0x57,0x30,0x50,255,0x4f,0x53,0x45,255])
shared=(ROOT/'crates/shared/src/lib.rs').read_text(encoding='utf-8')
for name,value in [('WIDTH',WIDTH),('HEIGHT',HEIGHT),('TILE',TILE),('COLUMNS',COLUMNS),('COUNT',POSES)]:
    assert int(re.search(r'CURTAIN_POSE_'+name+r': u32 = (\d+)',shared)[1])==value



def dds(image):
    image = image.convert('RGBA')
    width,height = image.size
    result = bytearray(148+width*height*4)
    result[:4] = b'DDS '
    for offset,value in [(4,124),(8,0x100F),(12,height),(16,width),(20,width*4),(28,1),
                         (76,32),(80,4),(108,0x1000),(128,91),(132,3),(140,1)]:
        struct.pack_into('<I',result,offset,value)
    result[84:88] = b'DX10'
    result[148:] = image.tobytes('raw','BGRA')
    result[148:156] = MAGIC
    return bytes(result)


files = {}
for model in (MODEL,EXTERIOR):
    for suffix in ('.pmd','.pmg'):
        files[model+suffix]=(CACHE/(model+suffix)).read_bytes()
references=set()
for model in (MODEL,EXTERIOR):
    references.update(re.findall(rb'/automat/[a-zA-Z0-9_/]+\.mat',files[model+'.pmd']))
assert len(references)==2
with zipfile.ZipFile(BASE) as base:
    base_names = set(base.namelist())
    for path in references:
        path = path.decode().lstrip('/')
        files[path] = (CACHE/path).read_bytes()
        for target in re.findall(rb'"(/[^"\r\n]+\.tobj)"', files[path]):
            target=target.decode().lstrip('/')
            assert target==TEXTURE+'.tobj' or target in base_names,target
    assert any(b'eut2.dif.spec.shadow.a' in files[p.decode().lstrip('/')] for p in references), 'Alpha-masked sun caster missing'
    for truck in ('scania.s_2016','scania.r_2016'):
        path=f'def/vehicle/truck/{truck}/accessory/intlight_bck/curtains_08.sii'
        original=base.read(path).decode('utf-8')
        assert 'Grey Danish Pluche' in original
        assert '/intlight_bck/scania_2016/curtains.pmd' in original
        files[path]=f'''SiiNunit
{{
accessory_addon_data : curtains_08.{truck}.intlight_bck
{{
 name: "Grey Danish Pluche - W0RPLAY"
 price: 200
 unlock: 0
 icon: "curtains_side/weiss_p"
 interior_model: "/{MODEL}.pmd"
 exterior_model: "/{EXTERIOR}.pmd"
}}
}}
'''.encode()

atlas=Image.open(ROOT/'mods/w0rplay-wolli-curtains/source'/ (TEXTURE+'.tga')).convert('RGBA')
assert atlas.size==(WIDTH,HEIGHT)
for i in range(POSES):
    rect=(4+(i%COLUMNS)*TILE,8+(i//COLUMNS)*TILE)
    tile=atlas.crop((*rect,rect[0]+TILE,rect[1]+TILE))
    assert tile.getchannel('A').getextrema()==((255,255) if i==0 else (0,0))
files[TEXTURE+'.dds']=dds(atlas)
files[TEXTURE+'.tobj']=(CACHE/(TEXTURE+'.tobj')).read_bytes()
assert (TEXTURE+'.dds').encode() in files[TEXTURE+'.tobj']
files['manifest.sii']=b'''SiiNunit
{
mod_package : .w0rplay_wolli_curtains
{
 package_version: "0.5.0"
 display_name: "W0RPLAY - Wolli Full Glass Curtains"
 author: "W0RPLAY compatibility / Wolli fabric"
 category[]: "interior"
 description_file: "description.txt"
 compatible_versions[]: "1.61.*"
}
}
'''
files['description.txt']='''Scania S/R Smart Dash - on cam, yan camlar ve Highline tavan cami icin perde.
Wolli Interior Addon 1.6 gerekli. Mod Yoneticisi'nde Wolli'nin USTUNE koy.
Grey Danish Pluche takiliysa ayni aksesuar guncellenir. Degilse servisten sec.
Eski W0RPLAY on perde aksesuarini serviste cikart; bu yama uc cami birlikte kapatir.
CarPlay > Kabin > Perde ile yuvarlak U raydaki perdeler on, yan ve tavan camlarini orter.
16 tam 3B poz kullanir; iskelet animasyonu veya kumas fizigi degildir.
W0RPLAY 2.1.13 oyun DLL'si gerekir. Temel Wolli arsivi degistirilmez.
'''.encode('utf-8')
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(OUTPUT,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as out:
    for path,content in sorted(files.items()):out.writestr(path,content)
report={
    'version':'0.5.0','requires':'Wolli Interior Addon 1.6','baseSha256':hashlib.sha256(BASE.read_bytes()).hexdigest(),
    'archiveSha256':hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),'bytes':OUTPUT.stat().st_size,
    'entries':len(files),'poses':POSES,'atlas':[WIDTH,HEIGHT],'gpuAtlasBytes':WIDTH*HEIGHT*4,
    'cpuPaletteBytes':TILE*TILE*4*2,'newDrawHooks':0,'additionalBrowserProcesses':0,
    'animation':'16 discrete complete 3D poses, no skeletal deformation or cloth physics',
    'coverage':'full windshield, both side windows and Highline roof glass',
    'geometry':json.loads((ROOT/'.impeccable/review/wolli-curtains/geometry.json').read_text(encoding='utf-8')),
    'requiresNewNativeBuild':False,
    'sunShadowPassEnabled':True,
    'sunShadowInGameVerified':False,
    'separateCalibratedExteriorModel':True,
    'gameFitVerified':False,'gamePerformanceVerified':False,
}
(OUTPUT.parent/'build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
