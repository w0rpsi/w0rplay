"""Original Scania curtain geometry. Run with Blender 3.6 --background --python.

Only original geometry is exported. Reference game/mod models are never included.
Coordinates are relative to the stock Scania `curtain_f` locator, in metres.
"""
from pathlib import Path
import math
import sys
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools/vendor/blender-scripts/addons"))
bpy.ops.preferences.addon_enable(module="io_scs_tools")
from io_scs_tools.utils import get_scs_globals
from io_scs_tools.exp import pix
from io_scs_tools.utils import printout
# Headless modelling has no Blender viewport to redraw.
printout._ImmediateMsgHandler.report_message_and_redraw = lambda self, message: None

PROJECT = ROOT / "mods/w0rplay-curtain/source"
MODEL = PROJECT / "model/w0rplay/curtain/scania_2016"
TEXTURES = PROJECT / "material/w0rplay/curtain"
PREVIEW = ROOT / ".impeccable/review/curtain"
for directory in (MODEL, TEXTURES, PREVIEW):
    directory.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
settings = get_scs_globals()
settings.scs_project_path = str(PROJECT)
settings.export_output_type = '5'
settings.export_pim_file = True
settings.export_pit_file = True
settings.export_pic_file = False
settings.export_pis_file = False
settings.export_pia_file = False

root = bpy.data.objects.new("w0r_curtain", None)
bpy.context.collection.objects.link(root)
bpy.context.view_layer.objects.active = root
root.scs_props.empty_object_type = 'SCS_Root'


def image(name, width, height, alpha):
    img = bpy.data.images.new(name, width=width, height=height, alpha=True)
    data = []
    for y in range(height):
        for x in range(width):
            weave = 0.006 * ((x + y) % 2)
            data.extend((0.12 + weave, 0.13 + weave, 0.15 + weave, alpha))
    img.pixels.foreach_set(data)
    img.filepath_raw = str(TEXTURES / (name + '.tga'))
    img.file_format = 'TARGA'
    img.save()
    (TEXTURES / (name + '.tobj')).write_text(
        'map 2d ' + name + '.tga\naddr clamp_to_edge clamp_to_edge\nnomips\n', encoding='utf-8')
    return img


mask_image = image('mask', 1028, 8, 0.0)
cloth_image = image('cloth', 64, 64, 1.0)


def material(name, texture_name, effect):
    mat = bpy.data.materials.new(name)
    mat.scs_props.active_shader_preset_name = '<imported>'
    mat.scs_props.mat_effect_name = effect
    mat.scs_props.shader_attribute_diffuse = (1.0, 1.0, 1.0)
    mat.scs_props.shader_attribute_specular = (0.035, 0.035, 0.035)
    mat.scs_props.shader_attribute_shininess = 12
    mat.scs_props.shader_attribute_add_ambient = 0
    attrs = {}
    for i, (tag, fmt, value) in enumerate([
        ('diffuse', 'FLOAT3', [1.0, 1.0, 1.0]),
        ('specular', 'FLOAT3', [0.035]*3), ('shininess', 'FLOAT', [12.0]),
        ('add_ambient', 'FLOAT', [0.0]),
    ]):
        attrs[str(i)] = {'Tag': tag, 'Format': fmt, 'Value': value}
    tex_path = '/material/w0rplay/curtain/' + texture_name
    mat['scs_shader_attributes'] = {'effect': effect, 'attributes': attrs,
        'textures': {'0': {'Tag': 'texture[0]:texture_base', 'Value': tex_path}}}
    mat.scs_props.shader_texture_base = '//material/w0rplay/curtain/' + texture_name + '.tga'
    mat.scs_props.shader_texture_base_use_imported = True
    mat.scs_props.shader_texture_base_imported_tobj = tex_path
    uv = mat.scs_props.custom_tex_coord_maps.add()
    uv.name = 'tex_coord_0'
    uv.value = 'UVMap'
    return mat


closed_material = material('curtain_panel', 'mask', 'eut2.dif.spec.a')
fold_material = material('gathered_cloth', 'cloth', 'eut2.dif.spec')
rail_material = material('rail', 'cloth', 'eut2.dif.spec')
rail_material.scs_props.shader_attribute_diffuse = (0.1, 0.1, 0.11)
meshes = []


def mesh(name, positions, faces, uv_values, mat):
    # Blender Z up -> SCS Y up; reverse this when authoring in the locator's game space.
    vertices = [(x, -z, y) for x, y, z in positions]
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    uv = data.uv_layers.new(name='UVMap')
    for poly in data.polygons:
        poly.use_smooth = True
        for loop_index in poly.loop_indices:
            uv.data[loop_index].uv = uv_values[data.loops[loop_index].vertex_index]
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    obj.scs_props.scs_part = 'defaultpart'
    data.materials.append(mat)
    for layer_name in ('Col', 'Col_alpha'):
        layer = data.vertex_colors.new(name=layer_name)
        for item in layer.data: item.color = (0.5,0.5,0.5,1)
    if name.startswith(('panel_', 'folds_')):
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new('fabric_thickness', 'SOLIDIFY')
        modifier.thickness = 0.0015
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    meshes.append(obj)
    return obj


def panel(side, gathered=False):
    nx, ny = (72, 8) if not gathered else (48, 8)
    width = 1.018 if not gathered else 0.135
    outer = 1.018
    verts, uvs, faces = [], [], []
    for row in range(ny + 1):
        v = row / ny
        for col in range(nx + 1):
            u = col / nx
            x = side * (outer - width * u)
            amplitude = 0.024 if not gathered else 0.041
            folds = 12 if not gathered else 7
            z = 0.065 + (0.045 if gathered else 0.0) + 0.02*v + amplitude * math.cos(u*folds*2*math.pi)
            y = 0.052 - 0.88*v - 0.008*math.sin(u*math.pi)**2*v
            verts.append((x, y, z))
            # Mask V stays away from the identifying row reserved in the runtime texture.
            uvs.append((u, 0.5) if not gathered else (u, v))
    for row in range(ny):
        for col in range(nx):
            a = row*(nx+1)+col
            quad = (a, a+1, a+nx+2, a+nx+1)
            # Double sided original cloth: readable from driver and passenger side.
            faces.append(quad)
    return mesh(('folds_' if gathered else 'panel_')+str(side), verts, faces, uvs,
        fold_material if gathered else closed_material)


for side in (-1, 1):
    panel(side)
    panel(side, True)

# Slim rail; no physics, particles or high subdivision modifiers.
verts = [(x,y,z) for x in (-1.025,1.025) for y in (0.056,0.08) for z in (0.053,0.077)]
faces = [(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)]
mesh('rail', verts, faces, [(0,0)]*8, rail_material)
bpy.context.view_layer.update()
if not pix.export(str(MODEL), '', root, meshes):
    raise RuntimeError('SCS model export failed')
bpy.ops.wm.save_as_mainfile(filepath=str(MODEL / 'w0r_curtain.blend'))

# Review renders use a conventional material without changing the exported SCS attributes.
def preview_material(mat, img=None):
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Base Color'].default_value = (0.035,0.039,0.046,1)
    shader.inputs['Roughness'].default_value = 0.86
    if img:
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = img
        mat.node_tree.links.new(texture.outputs['Alpha'], shader.inputs['Alpha'])
        mat.blend_method = 'HASHED'
    mat.node_tree.links.new(shader.outputs[0], out.inputs[0])

preview_material(closed_material, mask_image)
preview_material(fold_material)
preview_material(rail_material)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.eevee.use_gtao = True
scene.eevee.taa_render_samples = 48
scene.render.resolution_x = 1200
scene.render.resolution_y = 760
scene.render.resolution_percentage = 100
scene.world.color = (0.18,0.18,0.18)
bpy.ops.object.camera_add(location=(1.8,-3.4,0.8))
camera = bpy.context.object
camera.rotation_euler = (Vector((0,0,-0.4))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 2.9
scene.camera = camera
for location, power, size in [((0,-2,2.5),900,3),((-2,0,1),500,2)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.data.energy, light.data.size = power, size
    light.rotation_euler = (Vector((0,0,-0.4))-light.location).to_track_quat('-Z','Y').to_euler()
for state, alpha in [('open',0.0),('closed',1.0)]:
    pixels = list(mask_image.pixels)
    for i in range(3,len(pixels),4): pixels[i] = alpha
    mask_image.pixels.foreach_set(pixels)
    mask_image.update()
    scene.render.filepath = str(PREVIEW/(state+'.png'))
    bpy.ops.render.render(write_still=True)
print('W0RPLAY_CURTAIN_EXPORT_OK', str(MODEL))
