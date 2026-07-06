import bpy, sys, os
from mathutils import Vector

obj_path = sys.argv[-3]
texture_path = sys.argv[-2]
render_dir = sys.argv[-1]

os.makedirs(render_dir, exist_ok=True)

def load_fixed_texture(path):
    if not path or not os.path.exists(path):
        return None

    img = bpy.data.images.load(path)
    img.alpha_mode = "CHANNEL_PACKED"

    pixels = list(img.pixels)
    for i in range(0, len(pixels), 4):
        pixels[i + 3] = 1.0

    img.pixels[:] = pixels
    img.update()
    return img

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

bpy.ops.wm.obj_import(filepath=obj_path)
objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]

mat = bpy.data.materials.new("UGC_Material")
mat.use_nodes = True
mat.blend_method = "OPAQUE"

bsdf = mat.node_tree.nodes.get("Principled BSDF")

if bsdf:
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Metallic"].default_value = 0
    bsdf.inputs["Roughness"].default_value = 1
    bsdf.inputs["Alpha"].default_value = 1

    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = 1

    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0

    img = load_fixed_texture(texture_path)

    if img:
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.extension = "CLIP"
        tex.interpolation = "Closest"
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

for obj in objs:
    obj.data.materials.clear()
    obj.data.materials.append(mat)

# Centralizar modelo
mins = Vector((999999, 999999, 999999))
maxs = Vector((-999999, -999999, -999999))

for obj in objs:
    for corner in obj.bound_box:
        world_pos = obj.matrix_world @ Vector(corner)
        mins.x = min(mins.x, world_pos.x)
        mins.y = min(mins.y, world_pos.y)
        mins.z = min(mins.z, world_pos.z)
        maxs.x = max(maxs.x, world_pos.x)
        maxs.y = max(maxs.y, world_pos.y)
        maxs.z = max(maxs.z, world_pos.z)

center = (mins + maxs) / 2
size = max((maxs - mins).x, (maxs - mins).y, (maxs - mins).z)

for obj in objs:
    obj.location -= center

# Camera
cam_data = bpy.data.cameras.new("Camera")
cam = bpy.data.objects.new("Camera", cam_data)
bpy.context.collection.objects.link(cam)
bpy.context.scene.camera = cam
cam.data.type = "ORTHO"
cam.data.ortho_scale = size * 1.35

# =========================
# Iluminação uniforme 360°
# mesma força em todos os lados
# =========================

light_positions = [
    ("Front_Light",  (0, -6, 2.5)),
    ("Back_Light",   (0,  6, 2.5)),
    ("Left_Light",   (-6, 0, 2.5)),
    ("Right_Light",  (6,  0, 2.5)),
    ("Bottom_Light", (0,  0, -6)),
    ("Top_Light",    (0,  0,  6)),
]

for name, location in light_positions:
    data = bpy.data.lights.new(name, type="AREA")
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)

    light.location = location

    # Luz muito mais suave
    light.data.energy = 450

    # Área muito maior = sombras suaves
    light.data.size = 18

# Pequenos ajustes
bpy.data.objects["Top_Light"].data.energy = 350
bpy.data.objects["Bottom_Light"].data.energy = 550

# Mundo neutro
world = bpy.context.scene.world or bpy.data.worlds.new("World")
bpy.context.scene.world = world
world.color = (0.50, 0.50, 0.50)

scene = bpy.context.scene
render_resolution = int(os.environ.get("REFAZER_RENDER_RESOLUTION", "768"))
scene.render.resolution_x = render_resolution
scene.render.resolution_y = render_resolution
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0.15
scene.view_settings.gamma = 1.0

try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except Exception:
    scene.render.engine = "BLENDER_EEVEE"

try:
    scene.eevee.taa_render_samples = int(os.environ.get("REFAZER_RENDER_SAMPLES", "16"))
except Exception:
    pass

try:
    scene.render.use_persistent_data = True
except Exception:
    pass

def look_at(camera, direction):
    direction = Vector(direction).normalized()
    distance = size * 2.2
    camera.location = direction * distance
    target = Vector((0, 0, 0))
    direction_to_target = target - camera.location
    camera.rotation_euler = direction_to_target.to_track_quat("-Z", "Y").to_euler()

views = {
    "frente.png": (0, -1, 0),
    "direita.png": (1, 0, 0),
    "costas.png": (0, 1, 0),
    "esquerda.png": (-1, 0, 0),
    "isometrica.png": (1, -1, 0.65),
}

for filename, direction in views.items():
    look_at(cam, direction)
    scene.render.filepath = os.path.join(render_dir, filename)
    bpy.ops.render.render(write_still=True)

print("✅ Renders finalizados.")
