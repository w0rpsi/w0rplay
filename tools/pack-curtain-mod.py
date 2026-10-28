"""Pack original converted curtain assets, with the exact mask format used by the plugin.

Requires SCS Conversion Tools output in tools/vendor/conversion-tools/rsrc/base/@cache.
No personal game/mod reference assets are read or redistributed by this script.
"""
import ast
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import zipfile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'tools/vendor/conversion-tools/rsrc/base/@cache'
OUTPUT = ROOT / 'mods/w0rplay-curtain/w0rplay_scania_curtain.scs'
shared = (ROOT / 'crates/shared/src/lib.rs').read_text(encoding='utf-8')
WIDTH = int(re.search(r'CURTAIN_WIDTH: u32 = (\d+)', shared)[1])
HEIGHT = int(re.search(r'CURTAIN_HEIGHT: u32 = (\d+)', shared)[1])
MAGIC = bytes(ast.literal_eval(re.search(r'CURTAIN_MAGIC: \[u8; 8\] = (\[[^\]]+\])', shared)[1]))


def dds(image):
    image = image.convert('RGBA')
    width, height = image.size
    result = bytearray(148 + width*height*4)
    result[:4] = b'DDS '
    for offset, value in [(4,124),(8,0x100F),(12,height),(16,width),(20,width*4),(28,1),
                          (76,32),(80,4),(108,0x1000),(128,91),(132,3),(140,1)]:
        struct.pack_into('<I', result, offset, value)
    result[84:88] = b'DX10'
    result[148:] = image.tobytes('raw', 'BGRA')
    return bytes(result)


def tobj(path):
    header = bytes([1,10,177,112,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,
                    2,0,3,3,2,0,2,2,0,0,0,0,0,1,0,0])
    return header + struct.pack('<II', len(path),0) + path.encode('ascii')


# The identifying first row must never be sampled, including solidified fabric edges.
pim=(ROOT/'mods/w0rplay-curtain/source/model/w0rplay/curtain/scania_2016/w0r_curtain.pim').read_text(encoding='utf-8')
panels=0
for piece in re.split(r'\nPiece\s*\{',pim)[1:]:
    if re.search(r'\bMaterial:\s*0\b',piece):
        stream=re.search(r'Tag:\s*"_UV0"([^}]+)',piece)[1]
        coordinates=re.findall(r'\d+\s*\(([^)]+)\)',stream)
        assert coordinates
        for row in coordinates:
            v=row.split()[1]
            value=struct.unpack('>f',bytes.fromhex(v[1:]))[0] if v.startswith('&') else float(v)
            assert abs(value-0.5)<1e-6, 'Private marker row could be sampled'
        panels+=1
assert panels==2

files = {}
model = 'model/w0rplay/curtain/scania_2016/w0r_curtain'
for suffix in ('.pmd','.pmg'):
    files[model+suffix] = (CACHE/(model+suffix)).read_bytes()
references = set(re.findall(rb'/automat/[a-zA-Z0-9_/]+\.mat', files[model+'.pmd']))
assert len(references)==3, f'Unexpected material references: {references}'
for raw_path in references:
    path = raw_path.decode('ascii').lstrip('/')
    files[path] = (CACHE/path).read_bytes()
    assert b'/material/w0rplay/curtain/' in files[path]
for path in ('material/w0rplay/curtain/cloth.dds','material/w0rplay/curtain/cloth.tobj'):
    files[path] = (CACHE/path).read_bytes()

mask = Image.open(ROOT/'mods/w0rplay-curtain/source/material/w0rplay/curtain/mask.tga').convert('RGBA')
assert mask.size==(WIDTH,HEIGHT)
mask.putalpha(0)  # The accessory stays open when the plugin/app is absent.
pixels = bytearray(dds(mask))
pixels[148:156] = MAGIC  # Reserved first row; the cloth samples V=0.5 only.
files['material/w0rplay/curtain/mask.dds'] = bytes(pixels)
files['material/w0rplay/curtain/mask.tobj'] = (CACHE/'material/w0rplay/curtain/mask.tobj').read_bytes()

for truck in ('scania.s_2016','scania.r_2016'):
    files[f'def/vehicle/truck/{truck}/accessory/curtain_f/w0rplay.sii'] = f'''SiiNunit
{{
accessory_addon_int_data : w0rcurtain.{truck}.curtain_f
{{
 name: "W0RPLAY - Smart Curtain"
 price: 250
 unlock: 0
 icon: "w0rplay/curtain"
 interior_model: "/{model}.pmd"
}}
}}
'''.encode('utf-8')

preview = Image.open(ROOT/'.impeccable/review/curtain/closed.png').convert('RGBA')
preview.thumbnail((128,100), Image.Resampling.LANCZOS)
icon = Image.new('RGBA',(128,128),(0,0,0,0))
icon.alpha_composite(preview,((128-preview.width)//2,(128-preview.height)//2))
files['material/ui/accessory/w0rplay/curtain.dds'] = dds(icon)
files['material/ui/accessory/w0rplay/curtain.tobj'] = tobj('/material/ui/accessory/w0rplay/curtain.dds')
files['material/ui/accessory/w0rplay/curtain.mat'] = b'material : "ui"\n{\n texture : "curtain.tobj"\n texture_name : "texture"\n}\n'
files['manifest.sii'] = b'''SiiNunit
{
mod_package : .w0rplay_scania_curtain
{
 package_version: "0.1.0"
 display_name: "W0RPLAY - Scania Smart Curtain"
 author: "W0RPLAY"
 category[]: "interior"
 description_file: "description.txt"
 compatible_versions[]: "1.61.*"
}
}
'''
files['description.txt'] = '''Original front curtain accessory for Scania S/R 2016 Smart Dash.
Activate this mod, then select W0RPLAY - Smart Curtain in the front curtain slot at a service shop.
Requires W0RPLAY 2.1.12+ for opening/closing from Cabin Controls. It stays open without the matching plugin.
The new accessory uses curtain_f; Wolli's sleeper TV uses another slot. Existing front curtains are replaced when fitting this part.
Prototype: physical fit in the user's actual cabin still needs an in-game check. No cloth physics or exterior model.
Original geometry, exported with SCS Blender Tools / Conversion Tools. No third-party game/mod geometry is included.
'''.encode('utf-8')
files['LICENSE.txt'] = (ROOT/'LICENSE').read_bytes()
# Every model material and texture must resolve inside this standalone package.
for path, data in files.items():
    if path.startswith('automat/'):
        for ref in re.findall(rb'source\s*:\s*"([^"]+)"', data):
            assert ref.decode('ascii').lstrip('/') in files, (path, ref)
    if path.endswith('.tobj'):
        length=struct.unpack_from('<I',data,40)[0]
        ref=data[48:48+length].decode('ascii').lstrip('/')
        assert ref in files, (path,ref)
    if path.startswith('def/'):
        for ref in re.findall(rb'interior_model:\s*"([^"]+)"',data):
            assert ref.decode('ascii').lstrip('/') in files, (path,ref)
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(OUTPUT,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for path,data in sorted(files.items()): z.writestr(path,data)

# Validate the complete dependency chain and the runtime DDS contract, rather than just zip existence.
with zipfile.ZipFile(OUTPUT) as z:
    assert z.testzip() is None
    for reference in references: assert reference.decode().lstrip('/') in z.namelist()
    marker=z.read('material/w0rplay/curtain/mask.dds')
    assert marker[148:156]==MAGIC and struct.unpack_from('<II',marker,12)==(HEIGHT,WIDTH)
    assert len(marker)==148+WIDTH*HEIGHT*4
report = {'archive':str(OUTPUT),'sha256':hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
          'files':len(files),'bytes':OUTPUT.stat().st_size,'mask':[WIDTH,HEIGHT],
          'geometry':'original, 4400 exported vertices','gameFitVerified':False,
          'nativeControl':'matching W0RPLAY 2.1.12 / bridge ABI 24 required'}
(OUTPUT.parent/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
