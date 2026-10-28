"""Build a local-only compatibility model from the installed Wolli curtain.

Run in the existing portable Blender. Requires ConverterPIX's extracted reference
under tools/vendor/curtain-reference-pix. Does not change the installed base mod.
The result uses discrete complete 3D poses, not skeletal or cloth simulation.
"""
from pathlib import Path
import json
import math
import re
import struct
import sys
from functools import lru_cache
import bpy
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/vendor/blender-scripts/addons'))
bpy.ops.preferences.addon_enable(module='io_scs_tools')
from io_scs_tools.utils import get_scs_globals, printout
from io_scs_tools.exp import pix
printout._ImmediateMsgHandler.report_message_and_redraw = lambda self, message: None

PROJECT = ROOT / 'mods/w0rplay-wolli-curtains/source'
MODEL = PROJECT / 'model/w0rplay/wolli_curtains'
REVIEW = ROOT / '.impeccable/review/wolli-curtains'
for p in (MODEL, REVIEW):
    p.mkdir(parents=True, exist_ok=True)
REFERENCE = ROOT / 'tools/vendor/curtain-reference-pix/vehicle/truck/upgrade/interior_decors/intlight_bck/scania_2016/curtains.pim'
POSES, COLUMNS, TILE = 16, 4, 256
WIDTH, HEIGHT = 1032, 1032

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
g = get_scs_globals()
g.scs_project_path = str(PROJECT)
g.export_output_type = '5'
g.export_pim_file = g.export_pit_file = True
g.export_pic_file = g.export_pis_file = g.export_pia_file = False
root = bpy.data.objects.new('w0r_wolli', None)
bpy.context.collection.objects.link(root)
root.scs_props.empty_object_type = 'SCS_Root'


def numbers(row):
    return [struct.unpack('>f', bytes.fromhex(v[1:]))[0] if v.startswith('&') else float(v) for v in row.split()]


def read_piece(piece):
    def stream(tag):
        body = re.search(r'Tag:\s*"' + tag + r'"([^}]+)', piece)[1]
        return [numbers(r) for r in re.findall(r'\d+\s*\(([^)]+)\)', body)]
    faces = [tuple(map(int, r.split())) for r in re.findall(r'\d+\s*\(([^)]+)\)', re.search(r'Triangles\s*\{([^}]+)', piece)[1])]
    return stream('_POSITION'), [(u, 1-v) for u,v in stream('_UV0')], faces


def material(name, texture, alpha=False, uv='UVMap'):
    mat = bpy.data.materials.new(name)
    effect = 'eut2.dif.spec.shadow.a' if alpha else 'eut2.dif.spec'
    mat.scs_props.active_shader_preset_name = '<imported>'
    mat.scs_props.mat_effect_name = effect
    mat.scs_props.shader_attribute_diffuse = (0.564706,)*3 if alpha else (1.0,)*3
    mat.scs_props.shader_attribute_specular = (0.0,)*3 if alpha else (0.12,)*3
    mat.scs_props.shader_attribute_shininess = 15
    mat.scs_props.shader_attribute_add_ambient = 0
    attrs = {}
    for i, (tag, fmt, value) in enumerate([
        ('diffuse', 'FLOAT3', [0.564706]*3 if alpha else [1.0]*3),
        ('specular', 'FLOAT3', [0.0]*3 if alpha else [0.12]*3),
        ('shininess', 'FLOAT', [15.0]), ('add_ambient', 'FLOAT', [0.0]),
    ]):
        attrs[str(i)] = {'Tag': tag, 'Format': fmt, 'Value': value}
    mat['scs_shader_attributes'] = {'effect': effect, 'attributes': attrs,
        'textures': {'0': {'Tag': 'texture[0]:texture_base', 'Value': texture}}}
    mat.scs_props.shader_texture_base = '//' + texture.lstrip('/') + '.tga'
    mat.scs_props.shader_texture_base_use_imported = True
    mat.scs_props.shader_texture_base_imported_tobj = texture
    mapping = mat.scs_props.custom_tex_coord_maps.add()
    mapping.name, mapping.value = 'tex_coord_0', uv
    return mat


cloth_mat = material('w0r_side_pose', '/material/w0rplay/wolli_curtains/poses', True)
rail_mat = material('w0r_side_rail', '/vehicle/truck/upgrade/interior_decors/curtains/textures/stange')


def mesh(name, positions, uvs, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata([(x, -z, y) for x, y, z in positions], [], faces)
    data.update()
    layer = data.uv_layers.new(name='UVMap')
    for poly in data.polygons:
        poly.use_smooth = True
        for i in poly.loop_indices:
            layer.data[i].uv = uvs[data.loops[i].vertex_index]
    for name_col in ('Col', 'Col_alpha'):
        for item in data.vertex_colors.new(name=name_col).data:
            item.color = (0.5, 0.5, 0.5, 1)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    obj.scs_props.scs_part = 'defaultpart'
    data.materials.append(mat)
    return obj


pieces = [read_piece(p) for p in re.split(r'\nPiece\s*\{', REFERENCE.read_text())[1:]]
# Measure the actual cabin glass and accessory locator. Author the wrap in cabin
# coordinates, then convert back to the intlight_bck attachment space.
CABIN = ROOT/'tools/vendor/reference/vehicle/truck/scania_2016/interior/super/model_super.pim'
SIDE_GLASS = ROOT/'tools/vendor/window-reference/vehicle/truck/scania_2016/interior/super/anim_super/anim_super.pim'
cabin_text = CABIN.read_text()
locator = next(block for block in re.findall(r'\nLocator\s*\{([^}]+)',cabin_text) if '"intlight_bck"' in block)
origin = Vector(numbers(re.search(r'Position:\s*\(([^)]+)',locator)[1]))
rotation = Quaternion(numbers(re.search(r'Rotation:\s*\(([^)]+)',locator)[1])).normalized()
inverse = rotation.conjugated()
CX = origin.x
front_piece = next(block for block in re.split(r'\nPiece\s*\{',cabin_text)[1:] if re.search(r'Index:\s*(\d+)',block)[1]=='16')
front_positions, front_uv, front_faces = read_piece(front_piece)
sides_text = SIDE_GLASS.read_text()
side_piece = next(block for block in re.split(r'\nPiece\s*\{',sides_text)[1:] if re.search(r'Index:\s*(\d+)',block)[1]=='1')
side_positions, side_uv, side_faces = read_piece(side_piece)
glass = np.array(front_positions)
fit = np.stack([np.ones(len(glass)),glass[:,1],glass[:,1]**2,(glass[:,0]-CX)**2],axis=1)
coefficients = np.linalg.lstsq(fit,glass[:,2],rcond=None)[0]
YTOP,YBOTTOM = 0.45,-0.55
front_bvh=BVHTree.FromPolygons([Vector(p) for p in front_positions],front_faces,all_triangles=True)

def local(world):
    return tuple(inverse @ (Vector(world)-origin))

@lru_cache(maxsize=32768)
def front_depth(x,y):
    # Use actual glass triangles, not a polynomial approximation at the table.
    hit,normal,index,distance=front_bvh.ray_cast(Vector((x,y,2)),Vector((0,0,-1)),5)
    if hit is None:
        a,b,c,d=coefficients
        estimate=float(a+b*y+c*y*y+d*(x-CX)**2)
        hit,normal,index,distance=front_bvh.find_nearest(Vector((x,y,estimate)))
    depth=hit.z
    at=max(0,min(1,(-y-0.02)/0.16))
    blend=at*at*(3-2*at)
    inset=0.12+(0.012-0.12)*blend
    return depth+inset

@lru_cache(maxsize=32)
def path(y):
    # C1-continuous rounded transition: side tangent -> Bezier quarter turn ->
    # windshield tangent. No reversed-X kink at the A-pillar.
    side_x = CX-1.02
    radius = 0.18
    end_x = side_x+radius
    end_z = front_depth(end_x,y)
    start = np.array([side_x,end_z+radius])
    end = np.array([end_x,end_z])
    slope = 2*float(coefficients[3])*(end_x-CX)
    handle = radius*0.5522847498
    rear=np.array([CX-1.12,0.25])
    side_tangent=(start-rear)/np.linalg.norm(start-rear)
    c1 = start+side_tangent*handle
    c2 = end-np.array([handle,handle*slope])
    knots = [tuple(rear),tuple(start)]
    for i in range(1,21):
        t=i/20
        point=(1-t)**3*start+3*(1-t)**2*t*c1+3*(1-t)*t*t*c2+t**3*end
        knots.append(tuple(point))
    for i in range(1,21):
        x=end_x+(CX+0.025-end_x)*i/20
        knots.append((x,front_depth(x,y)))
    return knots

def curve(distance,y):
    knots = path(y)
    for (x,z),(xx,zz) in zip(knots,knots[1:]):
        length = math.hypot(xx-x,zz-z)
        if distance<=length:
            t = max(0,min(1,distance/length))
            return x+(xx-x)*t,z+(zz-z)*t,-(zz-z)/length,(xx-x)/length
        distance -= length
    (x,z),(xx,zz) = knots[-2:]
    length = math.hypot(xx-x,zz-z)
    return xx,zz,-(zz-z)/length,(xx-x)/length

@lru_cache(maxsize=32)
def full_length(y):
    knots = path(y)
    return sum(math.hypot(xx-x,zz-z) for (x,z),(xx,zz) in zip(knots,knots[1:]))

NX,NY = 64,8
V_VALUES=sorted(set([i/NY for i in range(NY+1)]+[(YTOP+0.18)/(YTOP-YBOTTOM),(YTOP+0.245)/(YTOP-YBOTTOM)]))
NY=len(V_VALUES)-1
specs,uvs,faces = [],[],[]
for side in (-1,1):
    for back in (False,True):
        offset = len(specs)
        for row,v in enumerate(V_VALUES):
            for col in range(NX+1):
                u = col/NX
                specs.append((side,u,v,back))
                uvs.append((u*0.78+0.01,1-v*0.97-0.01))
        for row in range(NY):
            for col in range(NX):
                a = offset+row*(NX+1)+col
                for tri in [(a,a+1,a+NX+2),(a,a+NX+2,a+NX+1)]:
                    faces.append(tuple(reversed(tri)) if back else tri)

# A roller-style blind sits below the actual Highline roof glass (piece71).
ROOF_X,ROOF_Z,ROOF_Y = (CX-0.41,CX+0.41),(-0.55,-0.075),0.995
roof_nx,roof_ny=12,8
for back in (False,True):
    offset=len(specs)
    for row in range(roof_ny+1):
        v=row/roof_ny
        for col in range(roof_nx+1):
            u=col/roof_nx
            specs.append(('roof',u,v,back))
            uvs.append((u*0.78+0.01,1-v*0.97-0.01))
    for row in range(roof_ny):
        for col in range(roof_nx):
            a=offset+row*(roof_nx+1)+col
            for tri in [(a,a+1,a+roof_nx+2),(a,a+roof_nx+2,a+roof_nx+1)]:
                faces.append(tuple(reversed(tri)) if back else tri)

def position(spec,progress):
    side,u,v,back = spec
    if side=='roof':
        width=0.035+(ROOF_Z[1]-ROOF_Z[0]-0.035)*progress
        x=ROOF_X[0]+u*(ROOF_X[1]-ROOF_X[0])
        y=ROOF_Y+0.003*math.cos(v*math.tau*4)+(0.001 if back else 0)
        z=ROOF_Z[1]-v*width
        return local((x,y,z))
    y = YTOP+(YBOTTOM-YTOP)*v
    gather = 0.35-0.24*math.exp(-((v-0.76)/0.22)**2)
    extent = gather+(full_length(y)-gather)*progress
    x,z,nx,nz = curve(u*extent,y)
    wave=math.cos(u*math.tau*12)
    fold = (0.026+(0.010-0.026)*progress)*wave
    if nz>0.8 and y<=-0.18:
        # Tight table/glass corridor: all folds stay on the cabin side of glass,
        # within 3mm of the base surface instead of swinging through the tabletop.
        fold=0.003*(0.5+0.5*wave)
    fold -= 0.001 if back else 0
    x,z = x+nx*fold,z+nz*fold
    if side==1:
        x = 2*CX-x
        z += 0.003*progress # overlap the centre seam without coplanar cloth
    y -= 0.003*v**6*math.cos(u*math.tau*12)
    return local((x,y,z))

positions = [position(spec,0) for spec in specs]
pose_objects = []
for index in range(POSES):
    progress = index/(POSES-1)
    posed, atlas_uv = [], []
    for spec, (u, v) in zip(specs, uvs):
        posed.append(position(spec,progress))
        atlas_uv.append(((4+(index%COLUMNS)*TILE+0.5+u*(TILE-1))/WIDTH,
                         1-(8+(index//COLUMNS)*TILE+0.5+(1-v)*(TILE-1))/HEIGHT))
    pose_objects.append(mesh('pose_%02d' % index, posed, atlas_uv, faces, cloth_mat))

# A continuous original rail surrounds both sides and the windshield.
left_rail = path(YTOP+0.02)
left_rail[-1] = (CX,front_depth(CX,YTOP+0.02))
rail_path = left_rail+[(2*CX-x,z) for x,z in reversed(left_rail[:-1])]
rail_positions,rail_uv,rail_faces = [],[],[]
for i,(x,z) in enumerate(rail_path):
    before=rail_path[max(0,i-1)];after=rail_path[min(len(rail_path)-1,i+1)]
    dx_t,dz_t=after[0]-before[0],after[1]-before[1]
    length=math.hypot(dx_t,dz_t)
    nx,nz=-dz_t/length,dx_t/length
    for dx,dy in [(-0.008,-0.008),(0.008,-0.008),(0.008,0.008),(-0.008,0.008)]:
        rail_positions.append(local((x+nx*dx,YTOP+0.02+dy,z+nz*dx)))
        rail_uv.append((0.5,0.5))
for segment in range(len(rail_path)-1):
    for edge in range(4):
        a=segment*4+edge;b=segment*4+(edge+1)%4
        rail_faces.extend([(a,b,b+4),(a,b+4,a+4)])
rail = mesh('wrap_rail',rail_positions,rail_uv,rail_faces,rail_mat)
# One cloth mesh/material: avoid a draw call for every animation frame.
bpy.ops.object.select_all(action='DESELECT')
for obj in pose_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = pose_objects[0]
bpy.ops.object.join()
all_cloth = bpy.context.object
all_cloth.name = 'whole_pose_atlas'
bpy.context.view_layer.objects.active = root
if not pix.export(str(MODEL), '', root, [all_cloth, rail]):
    raise RuntimeError('SCS model export failed')
# The installed Wolli model proves different interior/exterior coordinate frames.
# Apply its continuous cloth calibration, preserving the centre overlap. The
# interior rail stays inside the cabin and is omitted from the exterior LOD.
ext_report=json.loads((ROOT/'diagnostics/wolli-curtains/fit-04-exterior-roof-report.json').read_text())
ext_fit=ext_report['continuousClothAffine']
ext_matrix=np.array(ext_fit['matrixColumnConvention'])
ext_offset=np.array(ext_fit['translation'])
saved=[v.co.copy() for v in all_cloth.data.vertices]
for vertex in all_cloth.data.vertices:
    x,y,z=vertex.co.x,vertex.co.z,-vertex.co.y
    xx,yy,zz=ext_matrix@np.array([x,y,z])+ext_offset
    vertex.co=(xx,-zz,yy)
all_cloth.data.update()
all_cloth.update_tag()
bpy.context.view_layer.update()
bpy.context.evaluated_depsgraph_get().update()
root.name='w0r_wolli_ext'
if not pix.export(str(MODEL),'',root,[all_cloth]):
    raise RuntimeError('Exterior model export failed')
for vertex,co in zip(all_cloth.data.vertices,saved):vertex.co=co
all_cloth.data.update()
all_cloth.update_tag()
bpy.context.view_layer.update()
bpy.context.evaluated_depsgraph_get().update()
root.name='w0r_wolli'
bpy.ops.wm.save_as_mainfile(filepath=str(MODEL/'w0r_wolli.blend'))

# A review render shows just one full mesh pose; no hidden-frame overdraw in QA.
fabric = bpy.data.materials.new('review_grey_pluche')
fabric.use_nodes = True
bsdf = fabric.node_tree.nodes.get('Principled BSDF')
image = bpy.data.images.load(str(ROOT/'tools/vendor/curtain-reference/weiss_p.dds'))
tex = fabric.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = image
fabric.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.95
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.eevee.use_gtao = True
scene.eevee.taa_render_samples = 48
scene.render.resolution_x, scene.render.resolution_y = 1200, 760
scene.render.resolution_percentage = 100
scene.world.color = (0.12, 0.12, 0.12)
all_cloth.hide_render = True
rail.hide_render = True
def blender_world(world):
    x,y,z = local(world)
    return Vector((x,-z,y))
bpy.ops.object.camera_add(location=blender_world((CX,1.25,2.45)))
camera = bpy.context.object
camera.rotation_euler = (blender_world((CX,-0.08,-0.35))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 3.65
scene.camera = camera
bpy.ops.object.light_add(type='AREA', location=(0, 1, 2))
bpy.context.object.data.energy = 400
bpy.context.object.data.size = 3
review = mesh('review_pose', positions, uvs, faces, fabric)
for name, t in ([('open', 0), ('half', 0.5), ('closed', 1)] + [('frame_%02d'%i,i/(POSES-1)) for i in range(POSES)]):
    for vertex,spec in zip(review.data.vertices,specs):
        x,y,z = position(spec,t)
        vertex.co = (x,-z,y)
    scene.render.filepath = str(REVIEW/(name+'.png'))
    bpy.ops.render.render(write_still=True)
(REVIEW/'geometry.json').write_text(json.dumps({'poses':POSES,'trianglesPerPose':len(faces),
    'totalTriangles':len(faces)*POSES+len(rail_faces),'coverage':'full windshield, both side windows and roof glass','roundedCornerRadius':0.18,'sunShadowEffect':'eut2.dif.spec.shadow.a','roofBlindRootY':ROOF_Y,'lowerWindshieldInsetMetres':0.012,'tableBandFoldAmplitudeMetres':0.003,'sideRearHalfWidthMetres':1.12,'sideCornerHalfWidthMetres':1.02,'frontSurfaceSource':'actual windshield triangles via BVH','externalCalibration':ext_fit,'cabinRootY':[YBOTTOM,YTOP],'locator':{'position':list(origin),'rotation':list(rotation)},'frontDepthFit':coefficients.tolist(),'atlas':[WIDTH,HEIGHT],
    'animation':'discrete complete mesh poses, no skeletal deformation or cloth physics'},indent=2))
print('W0R_WOLLI_POSE_BUILD_OK')
