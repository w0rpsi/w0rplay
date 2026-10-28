import shutil
"""Ray-test the actual closed-pose cloth against the actual Scania front/side glass.
Read-only asset validation; no game process or injected renderer is used.
Run after geometry is finalized. Report is geometric evidence, not in-game fit proof.
"""
from pathlib import Path
import argparse,csv,hashlib,json,math,re,struct,time
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
STATIC=ROOT/'tools/vendor/reference/vehicle/truck/scania_2016/interior/super/model_super.pim'
SIDE=ROOT/'tools/vendor/window-reference/vehicle/truck/scania_2016/interior/super/anim_super/anim_super.pim'
CURTAIN=ROOT/'mods/w0rplay-wolli-curtains/source/model/w0rplay/wolli_curtains/w0r_wolli.pim'
OUT=ROOT/'diagnostics/wolli-curtains'

def numbers(row):
 return [struct.unpack('>f',bytes.fromhex(v[1:]))[0] if v.startswith('&') else float(v) for v in row.split()]
def pieces(path):
 result=[]
 for piece in re.split(r'\nPiece\s*\{',path.read_text(encoding='utf-8'))[1:]:
  def stream(tag):
   match=re.search(r'Tag:\s*"'+tag+r'"([^}]+)',piece)
   return np.array([numbers(r) for r in re.findall(r'\d+\s*\(([^)]+)\)',match[1])],dtype=np.float64) if match else None
  triangles=re.search(r'Triangles\s*\{([^}]+)',piece)
  faces=np.array([tuple(map(int,r.split())) for r in re.findall(r'\d+\s*\(([^)]+)\)',triangles[1])],dtype=np.int64)
  result.append({'index':int(re.search(r'Index:\s*(\d+)',piece)[1]),'material':int(re.search(r'Material:\s*(\d+)',piece)[1]),'positions':stream('_POSITION'),'uv':stream('_UV0'),'faces':faces})
 return result

def locator():
 text=STATIC.read_text(encoding='utf-8')
 b=re.search(r'Locator\s*\{\s*Name:\s*"intlight_bck"([^}]+)',text)[1]
 get=lambda k:np.array(numbers(re.search(k+r':\s*\(([^)]+)\)',b)[1]),dtype=np.float64)
 position,quaternion,scale=get('Position'),get('Rotation'),get('Scale')
 # PIX stores quaternion as W,X,Y,Z; matrices below act on column vectors.
 q=quaternion/np.linalg.norm(quaternion);w,x,y,z=q
 rotation=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
 return position,quaternion,scale,rotation

def glass_samples(triangles,spacing):
 points=[]
 for tri in triangles:
  a,b,c=tri
  n=max(1,int(math.ceil(max(np.linalg.norm(b-a),np.linalg.norm(c-a),np.linalg.norm(c-b))/spacing)))
  for i in range(n+1):
   for j in range(n+1-i):points.append(a+(b-a)*(i/n)+(c-a)*(j/n))
 # Duplicate faces/triangle edges do not increase the number of tested rays.
 return np.unique(np.round(np.array(points),7),axis=0)

def intersections(eye,targets,triangles):
 # Double-sided Moller-Trumbore. Parameter t=1 is the target glass point.
 # Use batches to bound the largest temporary arrays, irrespective of model size.
 a=triangles[:,0];edge1=triangles[:,1]-a;edge2=triangles[:,2]-a;tvec=eye[None,:]-a
 qvec=np.cross(tvec,edge1);numerator=np.einsum('ti,ti->t',edge2,qvec)
 result=np.full(len(targets),np.inf);face=np.full(len(targets),-1,dtype=int)
 for start in range(0,len(targets),96):
  direction=targets[start:start+96]-eye
  pvec=np.cross(direction[:,None,:],edge2[None,:,:]);det=np.einsum('tj,rtj->rt',edge1,pvec)
  inv=np.divide(1.,det,out=np.zeros_like(det),where=np.abs(det)>1e-12)
  u=np.einsum('tj,rtj->rt',tvec,pvec)*inv
  v=np.einsum('rj,tj->rt',direction,qvec)*inv
  t=numerator[None,:]*inv
  valid=(np.abs(det)>1e-12)&(u>=-1e-8)&(v>=-1e-8)&(u+v<=1+1e-8)&(t>1e-7)
  t=np.where(valid,t,np.inf);nearest=np.argmin(t,axis=1);minimum=t[np.arange(len(direction)),nearest]
  result[start:start+len(direction)]=minimum;face[start:start+len(direction)]=np.where(np.isfinite(minimum),nearest,-1)
 return result,face

def bound(points):return {'min':points.min(axis=0).tolist(),'max':points.max(axis=0).tolist()}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--driver-eye',nargs=3,type=float,required=True);parser.add_argument('--passenger-eye',nargs=3,type=float,required=True);parser.add_argument('--spacing',type=float,default=.015);parser.add_argument('--margin',type=float,default=.0005);parser.add_argument('--include-high-roof',action='store_true');parser.add_argument('--report-prefix',default='full-coverage');args=parser.parse_args()
 assert re.fullmatch(r'(?:full-coverage|fit-04)[a-zA-Z0-9_-]*',args.report_prefix),'Unsafe diagnostic prefix'
 assert 0<args.spacing<=.03
 started=time.time();OUT.mkdir(parents=True,exist_ok=True)
 front=next(p for p in pieces(STATIC) if p['index']==16);side=next(p for p in pieces(SIDE) if p['index']==1)
 assert front['material']==3 and side['material']==1
 sets={'windshield':front['positions'][front['faces']]}
 if args.include_high_roof:
  roof=next(p for p in pieces(STATIC) if p['index']==71);assert roof['material']==3
  sets['high_roof_glass']=roof['positions'][roof['faces']]
 side_tri=side['positions'][side['faces']]
 mid=(side['positions'][:,0].min()+side['positions'][:,0].max())/2
 left=np.all(side_tri[:,:,0]<mid,axis=1);right=np.all(side_tri[:,:,0]>mid,axis=1)
 assert np.all(left|right),'Side-glass triangle crosses cabin centre; inspect classification'
 sets['left_window']=side_tri[left];sets['right_window']=side_tri[right]
 translation,quat,scale,rot=locator();closed=[];pose_counts={i:0 for i in range(16)}
 for p in pieces(CURTAIN):
  if p['material']!=0:continue
  assert p['uv'] is not None
  uv=p['uv'];col=np.floor((uv[:,0]*1032-4)/256+1e-8).astype(int);row=np.floor((uv[:,1]*1032-8)/256+1e-8).astype(int);cell=row*4+col
  for i in range(16):pose_counts[i]+=int(np.all(cell[p['faces']]==i,axis=1).sum())
  selected=p['faces'][np.all(cell[p['faces']]==15,axis=1)]
  root=(p['positions']*scale)@rot.T+translation
  closed.extend(root[selected])
 closed=np.array(closed);assert len(closed)>0,'No whole closed-pose triangles in atlas cell15'
 area=np.linalg.norm(np.cross(closed[:,1]-closed[:,0],closed[:,2]-closed[:,0]),axis=1)/2
 assert np.count_nonzero(area>1e-10)>.95*len(area),'Too many degenerate curtain triangles'
 closed=closed[area>1e-10]
 eyes={'driver':np.array(args.driver_eye),'passenger':np.array(args.passenger_eye)}
 failures=[];cases=[]
 for name,triangles in sets.items():
  samples=glass_samples(triangles,args.spacing)
  for camera,eye in eyes.items():
   t,face=intersections(eye,samples,closed);distance=np.linalg.norm(samples-eye,axis=1)
   gap=(1-t)*distance;covered=np.isfinite(t)&(gap>=args.margin)
   failed=np.where(~covered)[0]
   for i in failed:
    failures.append([camera,name,*samples[i].tolist(),float(t[i]) if np.isfinite(t[i]) else None,float(gap[i]) if np.isfinite(t[i]) else None,int(face[i])])
   item={'eye':camera,'glass':name,'glassTriangles':len(triangles),'rays':len(samples),'covered':int(covered.sum()),'uncovered':len(failed),'coveragePercent':float(covered.mean()*100),'glassBounds':bound(samples),'uncoveredBounds':bound(samples[failed]) if len(failed) else None,'minimumBeforeGlassGapMetres':float(gap[covered].min()) if np.any(covered) else None}
   cases.append(item);print(json.dumps(item))
 record={'status':'PASS' if not failures else 'FAIL','gameFitVerified':False,'method':'Deterministic two-sided ray/actual-triangle intersection; closed atlas pose15 transformed by intlight_bck locator; every glass region tested from both eyes; no behind-camera/opposite-side exclusions.','eyes':{k:v.tolist() for k,v in eyes.items()},'eyeSource':'Caller-specified representative nominal/robust cabin-root eyes; assumptions, not measured runtime camera positions.','sampleSpacingMetres':args.spacing,'requiredMarginBeforeGlassMetres':args.margin,'locator':{'position':translation.tolist(),'quaternionWXYZ':quat.tolist(),'scale':scale.tolist()},'curtainBounds':bound(closed.reshape(-1,3)),'closedPoseTriangles':len(closed),'poseTriangles':pose_counts,'cases':cases,'totalUncoveredRays':len(failures),'runtimeSeconds':time.time()-started,'assetSha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [STATIC,SIDE,CURTAIN]},'limits':['This validates specified eye positions only; moved cameras can produce different visibility.','Sampling includes all triangle vertices/edges and interior barycentric samples, with <=15mm spacing by default; holes below sample spacing may be missed.','Side glass is the animated model export bind/rest geometry; no arbitrary window opening animation is evaluated.','No game rendering, cab suspension, interior variant switch, mirrors, shadows or cloth physics is validated.','Ray tests are double-sided; rendered faces require the material/model face winding to remain correct.']}
 (OUT/(args.report_prefix+'-report.json')).write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
 with (OUT/(args.report_prefix+'-uncovered.csv')).open('w',newline='',encoding='utf-8') as f:
  writer=csv.writer(f);writer.writerow(['eye','glass','x','y','z','nearestCurtainT','beforeGlassGapMetres','curtainFace']);writer.writerows(failures)
 print('COVERAGE_RESULT',record['status'],'holes',len(failures),'seconds',round(record['runtimeSeconds'],2))
 return 0 if not failures else 2
def gpu_benchmark():
 import subprocess
 from PIL import Image,ImageChops
 base=ROOT/'tools/vendor/curtain-reference-pix/vehicle/truck/upgrade/interior_decors/intlight_bck/scania_2016/curtains.pim'
 cloth=ROOT/'tools/vendor/curtain-reference/weiss_p.dds'
 atlas=ROOT/'mods/w0rplay-wolli-curtains/source/material/w0rplay/wolli_curtains/poses.tga'
 translation,quat,scale,rotation=locator();models=[]
 for path in (base,CURTAIN):
  p=next(p for p in pieces(path) if p['material']==0)
  positions=(p['positions']*scale)@rotation.T+translation
  # Original model and new atlas both use the accessory locator. No side clipping:
  # both curtains and the new windshield section are submitted in one draw.
  raw=re.split(r'\nPiece\s*\{',path.read_text(encoding='utf-8'))[1]
  normals=np.array([numbers(r) for r in re.findall(r'\d+\s*\(([^)]+)\)',re.search(r'Tag:\s*"_NORMAL"([^}]+)',raw)[1])])@rotation.T
  vertices=np.column_stack((positions,normals,p['uv'])).astype('<f4')
  models.append((vertices,p['faces'].astype('<u4').reshape(-1)))
 original=Image.open(cloth).convert('RGBA');source=Image.open(atlas).convert('RGBA');images=[original]
 for active in (0,15):
  im=source.copy();alpha=Image.new('L',im.size,0);col,row=active%4,active//4
  alpha.paste(255,(4+col*256,8+row*256,4+(col+1)*256,8+(row+1)*256));im.putalpha(alpha);images.append(im)
 data=bytearray(struct.pack('<I',2))
 for vertices,indices in models:data+=struct.pack('<II',len(vertices),len(indices))+vertices.tobytes()+indices.tobytes()
 for im in images:data+=struct.pack('<II',*im.size)+im.tobytes()
 scene=OUT/'full-coverage-gpu-scene.bin';scene.write_bytes(data)
 cpp=(ROOT/'tools/benchmark-curtain.cpp').read_text(encoding='utf-8')
 forward=np.array([translation[0],-.1,-1.]);forward/=np.linalg.norm(forward)
 right=np.cross(forward,[0.,1.,0.]);right/=np.linalg.norm(right);up=np.cross(right,forward)
 def hlsl(v):return 'float3('+','.join(format(float(x),'.9f') for x in v)+')'
 #140deg horizontal FOV includes the windshield plus a visible left-window portion.
 tanh=math.tan(math.radians(70));tanv=tanh/(2560/1440)
 vs='Out vs(In i){Out o;float3 c=float3(dot(i.p,'+hlsl(right)+'),dot(i.p,'+hlsl(up)+'),dot(i.p,'+hlsl(forward)+'));o.p=float4(c.x/'+str(tanh)+',c.y/'+str(tanv)+',1.00050025*c.z-.050025013,c.z);o.n=i.n;o.uv=i.uv;return o;}'
 cpp=re.sub(r'Out vs\(In i\)\{.*?return o;\}',lambda m:vs,cpp,flags=re.S)
 cpp=cpp.replace('original_static','original_Wolli_both_sides_no_front').replace('atlas_pose0_open','full_wrap_atlas_pose0_open').replace('atlas_pose15_closed','full_wrap_atlas_pose15_closed')
 runner=OUT/'full-coverage-gpu-runner.cpp';runner.write_text(cpp,encoding='utf-8')
 compiler=Path(shutil.which('g++') or 'g++');exe=OUT/'full-coverage-gpu.exe'
 subprocess.run([str(compiler),str(runner),'-O2','-std=c++17','-municode','-o',str(exe),'-ld3d11','-ldxgi','-ld3dcompiler'],check=True)
 r=subprocess.run([str(exe),str(scene),str(OUT/'full-coverage-gpu')],capture_output=True,text=True)
 if r.returncode:raise RuntimeError(r.stdout+'\n'+r.stderr)
 (OUT/'full-coverage-gpu-results.txt').write_text(r.stdout,encoding='utf-8');print(r.stdout)
 coverage={}
 for index in range(3):
  raw=OUT/f'full-coverage-gpu-{index}.rgba';im=Image.frombytes('RGBA',(2560,1440),raw.read_bytes());im.save(raw.with_suffix('.png'));raw.unlink()
  rgb=im.convert('RGB');mask=ImageChops.difference(rgb,Image.new('RGB',rgb.size,rgb.getpixel((0,0)))).convert('L').point(lambda p:255 if p>2 else 0)
  coverage[str(index)]={'drawnPixelBounds':mask.getbbox(),'drawnPixelsApprox':sum(mask.histogram()[1:])}
 scene.unlink()
 record={'gameFitVerified':False,'camera':{'eye':[0,0,0],'lookAt':[float(translation[0]),-.1,-1.],'horizontalFovDegrees':140,'verticalFovDegrees':math.degrees(2*math.atan(tanv))},'transformedToRoot':True,'excludedRegions':[],'geometry':[{'vertices':len(v),'triangles':len(i)//3}for v,i in models],'comparisonLimit':'Original contains only left/right static side curtains; new model intentionally adds full windshield coverage. This is a bounded total draw-cost comparison, not equivalent geometry or solely hidden-pose overhead.','scope':'Isolated2560x1440 D3D11 alpha-clip diffuse shader, depth test/write and backface culling; real model vertices/normals/UV and RGB textures. No game or W0RPLAY process accessed.','limits':['Not ETS2 shaders, game FPS, or evidence of performance under in-game GPU saturation.','Mirrors/shadow passes/interior lights and game render scheduling are not measured.','No atlas update is performed per measured frame: static open/closed idle rendering cost.','Camera is an assumed nominal driver viewpoint and deliberately very wide140deg horizontalFOV; only window portions in this frustum are rendered.','Both actual curtain geometries are submitted, no filtering to left-side only.'],'readbackValidation':coverage,'assetSha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [STATIC,base,CURTAIN,cloth,atlas]},'results':r.stdout}
 (OUT/'full-coverage-gpu-evidence.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8');return 0

if __name__=='__main__':
 import sys
 raise SystemExit(gpu_benchmark() if '--gpu-benchmark' in sys.argv else main())
