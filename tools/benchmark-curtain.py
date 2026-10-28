import shutil
"""Isolated D3D11 comparison of actual static and whole-pose curtain assets.
No game process is opened, started, or injected. Intermediate assets stay in diagnostics.
"""
from pathlib import Path
import re,struct,subprocess,hashlib,json,zipfile
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'diagnostics/wolli-curtains';OUT.mkdir(parents=True,exist_ok=True)
BASE=ROOT/'tools/vendor/curtain-reference-pix/vehicle/truck/upgrade/interior_decors/intlight_bck/scania_2016/curtains.pim'
POSE=ROOT/'mods/w0rplay-wolli-curtains/source/model/w0rplay/wolli_curtains/w0r_wolli.pim'
CLOTH=ROOT/'tools/vendor/curtain-reference/weiss_p.dds'
ATLAS=ROOT/'mods/w0rplay-wolli-curtains/source/material/w0rplay/wolli_curtains/poses.tga'
def numbers(row):
 return [struct.unpack('>f',bytes.fromhex(v[1:]))[0] if v.startswith('&') else float(v) for v in row.split()]
def cloth(path):
 piece=re.split(r'\nPiece\s*\{',path.read_text(encoding='utf-8'))[1]
 def stream(tag):return [numbers(r) for r in re.findall(r'\d+\s*\(([^)]+)\)',re.search(r'Tag:\s*"'+tag+r'"([^}]+)',piece)[1])]
 pos,uv,norm=stream('_POSITION'),stream('_UV0'),stream('_NORMAL')
 faces=[tuple(map(int,r.split())) for r in re.findall(r'\d+\s*\(([^)]+)\)',re.search(r'Triangles\s*\{([^}]+)',piece)[1])]
 # Only the left side: no geometry crossing the centreline or opposite curtain.
 faces=[t for t in faces if all(pos[i][0]<-0.5 for i in t)]
 used=sorted({i for t in faces for i in t});remap={v:i for i,v in enumerate(used)}
 return [(*pos[i],*norm[i],*uv[i]) for i in used],[remap[i] for t in faces for i in t]
models=[cloth(BASE),cloth(POSE)]
textures=[Image.open(CLOTH).convert('RGBA'),Image.open(ATLAS).convert('RGBA')]
# Retain the exact RGB fabric atlas. Only the whole-pose alpha selector changes.
variants=[]
for active in (0,15):
 im=textures[1].copy();a=Image.new('L',im.size,0)
 col,row=active%4,active//4;a.paste(255,(4+col*256,8+row*256,4+(col+1)*256,8+(row+1)*256));im.putalpha(a);variants.append(im)
data=bytearray(struct.pack('<I',2))
for vertices,indices in models:
 data+=struct.pack('<II',len(vertices),len(indices))
 for v in vertices:data+=struct.pack('<8f',*v)
 data+=struct.pack('<%dI'%len(indices),*indices)
for im in [textures[0],*variants]:
 data+=struct.pack('<II',*im.size)+im.tobytes()
scene=OUT/'gpu-benchmark-scene.bin';scene.write_bytes(data)
compiler=Path(shutil.which('g++') or 'g++')
exe=OUT/'gpu-benchmark.exe'
subprocess.run([str(compiler),str(ROOT/'tools/benchmark-curtain.cpp'),'-O2','-std=c++17','-municode','-o',str(exe),'-ld3d11','-ldxgi','-ld3dcompiler'],check=True)
r=subprocess.run([str(exe),str(scene),str(OUT/'gpu-benchmark')],capture_output=True,text=True)
if r.returncode:raise RuntimeError(r.stdout+'\n'+r.stderr)
(OUT/'gpu-benchmark-results.txt').write_text(r.stdout,encoding='utf-8');print(r.stdout)
for p in OUT.glob('gpu-benchmark-*.rgba'):
 Image.frombytes('RGBA',(2560,1440),p.read_bytes()).save(p.with_suffix('.png'));p.unlink()
scene.unlink()
evidence={'assets':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [BASE,POSE,CLOTH,ATLAS]},'leftSideModels':[{'vertices':len(v),'triangles':len(i)//3}for v,i in models], 'projection':'Orthographic side window; 1.30 m vertical frustum and physical 16:9 aspect, 2560x1440 target. Horizontal axis -Z, vertical Y, depth X. Both cases use identical projection.','limitations':['Isolated simple textured alpha-clipped diffuse shader; not ETS2 shader/render pass or game FPS.','Only left cloth piece, no rail; actual positions/normals/UVs, no opposite side.','No game process or W0RPLAY UI/process was accessed.','Timestamp includes target/depth clears plus draw; warmup 2400 atlas frames plus60 frames per case; samples120 batches x32 frames per variant.','Back-face culling with depth testing/writes; static diffuse material coefficient 0.564706.'],'results':r.stdout}
(OUT/'gpu-benchmark-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
