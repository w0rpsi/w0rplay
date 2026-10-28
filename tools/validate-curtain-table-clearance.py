"""Triangle-level curtain/table validation; no game or UI/process interaction.
Table geometry is installed conservative reference, not proven fitted by saved-unit identity.
AABB BVH only selects candidates; SAT including coplanar axes decides actual intersection.
"""
from pathlib import Path
import argparse,csv,hashlib,json,math,re,time
import numpy as np
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'diagnostics/wolli-curtains'
_helper=ROOT/'tools/validate-curtain-coverage.py';_ns={'__name__':'read_only_geometry_helpers','__file__':str(_helper)};exec(compile(_helper.read_text(),str(_helper),'exec'),_ns)
pieces,numbers,STATIC=_ns['pieces'],_ns['numbers'],_ns['STATIC']
DEFAULT=ROOT/'mods/w0rplay-wolli-curtains/source/model/w0rplay/wolli_curtains/w0r_wolli.pim'
TABLEDIR=ROOT/'tools/vendor/table-reference/vehicle/truck/upgrade/interior_set/scania_2016'
def transform(name):
 block=re.search(r'Locator\s*\{\s*Name:\s*"'+re.escape(name)+r'"([^}]+)',STATIC.read_text())[1]
 get=lambda key:np.array(numbers(re.search(key+r':\s*\(([^)]+)\)',block)[1]))
 t,q,s=get('Position'),get('Rotation'),get('Scale');w,x,y,z=q/np.linalg.norm(q)
 r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
 return t,q,s,r

def valid_triangles(tri):return np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)>1e-12

def curtain_poses(path):
 t,q,s,r=transform('intlight_bck');poses={i:[] for i in range(16)}
 for p in pieces(path):
  if p['material']!=0:continue
  uv=p['uv'];assert uv is not None
  cell=np.floor((uv[:,1]*1032-8)/256+1e-8).astype(int)*4+np.floor((uv[:,0]*1032-4)/256+1e-8).astype(int)
  root=(p['positions']*s)@r.T+t
  for i in range(16):
   faces=p['faces'][np.all(cell[p['faces']]==i,axis=1)];poses[i].extend(root[faces])
 for i in poses:
  tri=np.array(poses[i]);assert len(tri)>0,f'No cloth pose{i}'
  poses[i]=tri[valid_triangles(tri)]
 return poses,{'position':t.tolist(),'quaternionWXYZ':q.tolist(),'scale':s.tolist()}

def tables(path):
 t,q,s,r=transform('set_dashbrd');tri=[];info=[]
 materialBlocks=re.findall(r'\nMaterial\s*\{([^}]+)',path.read_text())
 aliases=[re.search(r'Alias:\s*"([^"]+)"',b)[1]for b in materialBlocks]
 for p in pieces(path):
  root=(p['positions']*s)@r.T+t
  for faceIndex,face in enumerate(p['faces']):
   f=root[face]
   if np.linalg.norm(np.cross(f[1]-f[0],f[2]-f[0]))<=1e-12:continue
   tri.append(f);alias=aliases[p['material']];info.append({'piece':p['index'],'face':faceIndex,'material':p['material'],'alias':alias,'shadowOverlay':'shadow' in alias.lower()})
 return np.array(tri),info,{'position':t.tolist(),'quaternionWXYZ':q.tolist(),'scale':s.tolist()}

class BVH:
 def __init__(self,tri):
  self.mins=tri.min(axis=1);self.maxs=tri.max(axis=1);self.nodes=[]
  self.root=self.build(np.arange(len(tri)))
 def build(self,ids):
  lo=self.mins[ids].min(0);hi=self.maxs[ids].max(0);index=len(self.nodes);self.nodes.append(None)
  if len(ids)<=16:self.nodes[index]=(lo,hi,ids,None,None)
  else:
   centers=(self.mins[ids]+self.maxs[ids])*.5;axis=int(np.argmax(np.ptp(centers,axis=0)));order=np.argsort(centers[:,axis],kind='stable');ids=ids[order];half=len(ids)//2;l=self.build(ids[:half]);r=self.build(ids[half:]);self.nodes[index]=(lo,hi,None,l,r)
  return index
 def query(self,lo,hi):
  found=[];stack=[self.root]
  while stack:
   a,b,ids,l,r=self.nodes[stack.pop()]
   if np.any(a>hi) or np.any(b<lo):continue
   if ids is not None:
    use=np.all(self.mins[ids]<=hi,axis=1)&np.all(self.maxs[ids]>=lo,axis=1);found.extend(ids[use].tolist())
   else:stack.extend((l,r))
  return found

def tri_intersection(a,b,epsilon=1e-6):
 e1=np.roll(a,-1,axis=1)-a;e2=np.roll(b,-1,axis=1)-b
 n1=np.cross(e1[:,0],e1[:,1]);n2=np.cross(e2[:,0],e2[:,1]);axes=[n1,n2]
 axes.extend(np.cross(e1[:,i],e2[:,j])for i in range(3)for j in range(3))
 # These extra in-plane axes distinguish coplanar triangles with overlapping AABBs.
 axes.extend(np.cross(n1,e1[:,i])for i in range(3));axes.extend(np.cross(n2,e2[:,i])for i in range(3))
 axes=np.stack(axes,axis=1);norm=np.linalg.norm(axes,axis=2);valid=norm>1e-12;axes=np.divide(axes,norm[:,:,None],out=np.zeros_like(axes),where=valid[:,:,None])
 pa=np.einsum('nkj,nvj->nkv',axes,a);pb=np.einsum('nkj,nvj->nkv',axes,b)
 separate=(pa.max(2)<pb.min(2)-epsilon)|(pb.max(2)<pa.min(2)-epsilon)
 return ~np.any(separate&valid,axis=1)

def segment_distance(p,q,a,b):
 d=q-p;e=b-a;r=p-a;aa=np.einsum('ij,ij->i',d,d);ee=np.einsum('ij,ij->i',e,e);bb=np.einsum('ij,ij->i',d,e);cc=np.einsum('ij,ij->i',d,r);ff=np.einsum('ij,ij->i',e,r);denom=aa*ee-bb*bb
 ss=np.divide(bb*ff-cc*ee,denom,out=np.zeros(len(p)),where=np.abs(denom)>1e-24);ss=np.clip(ss,0,1);tt=(bb*ss+ff)/ee
 lower=tt<0;upper=tt>1;ss=np.where(lower,np.clip(-cc/aa,0,1),ss);ss=np.where(upper,np.clip((bb-cc)/aa,0,1),ss);tt=np.clip(tt,0,1)
 return np.linalg.norm((p+ss[:,None]*d)-(a+tt[:,None]*e),axis=1)

def point_triangle_distance(p,tri):
 a,b,c=tri[:,0],tri[:,1],tri[:,2];ab=b-a;ac=c-a;n=np.cross(ab,ac);nn=np.einsum('ij,ij->i',n,n);signed=np.einsum('ij,ij->i',p-a,n);projected=p-(signed/nn)[:,None]*n;v=projected-a
 d00=np.einsum('ij,ij->i',ab,ab);d01=np.einsum('ij,ij->i',ab,ac);d11=np.einsum('ij,ij->i',ac,ac);d20=np.einsum('ij,ij->i',v,ab);d21=np.einsum('ij,ij->i',v,ac);denom=d00*d11-d01*d01
 u=(d11*d20-d01*d21)/denom;w=(d00*d21-d01*d20)/denom;inside=(u>=0)&(w>=0)&(u+w<=1)
 dist=np.where(inside,np.abs(signed)/np.sqrt(nn),np.inf)
 for e0,e1 in[(a,b),(b,c),(c,a)]:
  e=e1-e0;s=np.clip(np.einsum('ij,ij->i',p-e0,e)/np.einsum('ij,ij->i',e,e),0,1);dist=np.minimum(dist,np.linalg.norm(p-(e0+s[:,None]*e),axis=1))
 return dist

def tri_distance(a,b,intersection):
 result=np.full(len(a),np.inf)
 for i in range(3):result=np.minimum(result,point_triangle_distance(a[:,i],b));result=np.minimum(result,point_triangle_distance(b[:,i],a))
 for i in range(3):
  for j in range(3):result=np.minimum(result,segment_distance(a[:,i],a[:,(i+1)%3],b[:,j],b[:,(j+1)%3]))
 return np.where(intersection,0,result)

def self_check():
 a=np.array([[[0.,0.,0.],[1.,0.,0.],[0.,1.,0.]]])
 for b,expected in[(a.copy(),True),(a+np.array([0,0,.006]),False),(a+np.array([.8,.8,0]),False),(a+np.array([1,0,0]),True)]:assert tri_intersection(a,b)[0]==expected
 d=tri_distance(a,a+np.array([0,0,.006]),np.array([False]))[0];assert abs(d-.006)<1e-12
 assert abs(tri_distance(a,a+np.array([.8,.8,0]),np.array([False]))[0]-.6/math.sqrt(2))<1e-12

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--curtain',default=str(DEFAULT));parser.add_argument('--report-prefix',default='fit-05-clearance');parser.add_argument('--distance-limit',type=float,default=.02);args=parser.parse_args();assert re.fullmatch(r'fit-05[a-zA-Z0-9_-]*',args.report_prefix)
 self_check();began=time.time();source=Path(args.curtain).resolve();poses,curtainLocator=curtain_poses(source);report=[];hits=[];tableBounds={};OUT.mkdir(parents=True,exist_ok=True)
 for tableName in['table','table_long']:
  path=TABLEDIR/(tableName+'.pim');table,infos,tableLocator=tables(path);tableBounds[tableName]={'min':table.reshape(-1,3).min(0).tolist(),'max':table.reshape(-1,3).max(0).tolist()};bvh=BVH(table)
  for pose,cloth in poses.items():
   pairs=[]
   for i,tri in enumerate(cloth):
    for j in bvh.query(tri.min(0)-args.distance_limit,tri.max(0)+args.distance_limit):pairs.append((i,j))
   affectedC=set();affectedT=set();physicalC=set();physicalT=set();pieceCounts={};minimum=np.inf;minimumPhysical=np.inf;minPair=None;bounds=[]
   for start in range(0,len(pairs),4096):
    pair=np.array(pairs[start:start+4096],dtype=int);a=cloth[pair[:,0]];b=table[pair[:,1]];cross=tri_intersection(a,b);distance=tri_distance(a,b,cross);k=int(np.argmin(distance))
    if distance[k]<minimum:minimum=float(distance[k]);minPair=pair[k].tolist()
    physical=np.array([not infos[i]['shadowOverlay']for i in pair[:,1]])
    if physical.any():minimumPhysical=min(minimumPhysical,float(distance[physical].min()))
    for n in np.where(cross)[0]:
     ci,ti=pair[n];info=infos[ti];affectedC.add(int(ci));affectedT.add(int(ti));pieceCounts[str(info['piece'])]=pieceCounts.get(str(info['piece']),0)+1
     if not info['shadowOverlay']:physicalC.add(int(ci));physicalT.add(int(ti))
     lo=np.maximum(a[n].min(0),b[n].min(0));hi=np.minimum(a[n].max(0),b[n].max(0));bounds.extend((lo,hi));hits.append([tableName,pose,int(ci),info['piece'],info['face'],info['alias'],info['shadowOverlay'],*lo.tolist(),*hi.tolist()])
   collisions=sum(pieceCounts.values());item={'table':tableName,'pose':pose,'clothTriangles':len(cloth),'tableTriangles':len(table),'candidatePairs':len(pairs),'intersectionPairs':collisions,'intersectingClothTriangles':len(affectedC),'intersectingTableTriangles':len(affectedT),'physicalClothTriangles':len(physicalC),'physicalTableTriangles':len(physicalT),'pairCountsByTablePiece':pieceCounts,'intersectingPairOverlapBounds':{'min':np.min(bounds,axis=0).tolist(),'max':np.max(bounds,axis=0).tolist()}if bounds else None,'minimumSurfaceDistanceMetres':minimum if minimum<=args.distance_limit else None,'minimumPhysicalSurfaceDistanceMetres':minimumPhysical if minimumPhysical<=args.distance_limit else None,'minimumDistanceLowerBoundMetres':None if minimum<=args.distance_limit else args.distance_limit,'closestTrianglePair':minPair}
   report.append(item);print(json.dumps(item),flush=True)
 record={'status':'PASS'if not hits else'FAIL','gameFitVerified':False,'method':'BVH AABB broadphase followed by17-axis double-sided triangle SAT including coplanar separation axes; actual per-pose triangles, not bounding boxes alone. Proximity uses vertex/face andedge/edge exact minimum distances for candidates within20mm by default.','clothLocator':curtainLocator,'tableLocator':tableLocator,'tableRootBounds':tableBounds,'tableIdentity':'Installed Racingtables are conservative reference colliders, not proved fitted by stockdash_set_01_v8.sii unit.','distanceSearchMetres':args.distance_limit,'intersectionToleranceMetres':1e-6,'cases':report,'totalIntersectionPairs':len(hits),'physicalIntersectionCases':sum(c['physicalClothTriangles']>0 for c in report),'runtimeSeconds':time.time()-began,'assetSha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in[source,STATIC,TABLEDIR/'table.pim',TABLEDIR/'table_long.pim']},'limits':['A zero intersection count proves no sampled-pose surface crossing for these meshes, not compatibility with every table mod.','All16 discrete poses tested; hypothetical interpolated geometry betweenposes isnotpresent/validated.','Table shadow-overlay mesh hits areidentified separately, but strictstatus includesalltablemeshes.','Double-sided duplicate geometry maycountmultipleintersectionpairs atsamephysicalcontact.','Contained cloth fullyinsidea closedtablevolume withoutcrossing itsboundary isnot separatelypoint-in-volume tested.','No game shadow/renderpass/physics/runtimeplacement verification.','Intersectionlocalizationbounds areconservativeAABB intersections ofpairs confirmed bytriangleSAT; not exactpenetrationvolumes.']}
 (OUT/(args.report_prefix+'-report.json')).write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
 with (OUT/(args.report_prefix+'-intersections.csv')).open('w',newline='',encoding='utf-8')as f:
  w=csv.writer(f);w.writerow(['table','pose','clothTriangle','tablePiece','tableTriangle','tableAlias','shadowOverlay','boundMinX','boundMinY','boundMinZ','boundMaxX','boundMaxY','boundMaxZ']);w.writerows(hits)
 print('CLEARANCE_RESULT',record['status'],'pairs',len(hits),'seconds',round(record['runtimeSeconds'],2));return 0 if not hits else 2
if __name__=='__main__':raise SystemExit(main())
