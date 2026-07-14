import bpy, sys, os, json
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[-4:]
obj_path = args[0]
texture_path = args[1]
render_dir = args[2]
settings_path = args[3] if len(args) > 3 else ""

DEFAULT_RENDER_SETTINGS = {
    "lighting": "studio",
    "ior": 1.0,
    "roughness": 1.0,
    "exposure": 0.15,
    "lightPower": 1.0,
}

def clamp(value, minimum, maximum, fallback):
    try:
        number = float(value)
    except Exception:
        return fallback
    return max(minimum, min(maximum, number))

def load_render_settings(path):
    settings = dict(DEFAULT_RENDER_SETTINGS)
    if path and os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as file:
                loaded = json.load(file)
            if isinstance(loaded, dict):
                settings.update(loaded)
        except Exception as err:
            print(f"Could not load render settings: {err}")

    if settings.get("lighting") not in {"studio", "soft", "dramatic", "flat"}:
        settings["lighting"] = DEFAULT_RENDER_SETTINGS["lighting"]

    settings["ior"] = clamp(settings.get("ior"), 1.0, 2.5, DEFAULT_RENDER_SETTINGS["ior"])
    settings["roughness"] = clamp(settings.get("roughness"), 0.0, 1.0, DEFAULT_RENDER_SETTINGS["roughness"])
    settings["exposure"] = clamp(settings.get("exposure"), -1.0, 1.0, DEFAULT_RENDER_SETTINGS["exposure"])
    settings["lightPower"] = clamp(settings.get("lightPower"), 0.2, 3.0, DEFAULT_RENDER_SETTINGS["lightPower"])
    return settings

render_settings = load_render_settings(settings_path)

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
    bsdf.inputs["Roughness"].default_value = render_settings["roughness"]
    bsdf.inputs["Alpha"].default_value = 1

    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = render_settings["ior"]

    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = clamp((render_settings["ior"] - 1.0) / 1.5, 0.0, 1.0, 0.0)

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

lighting_presets = {
    "studio": {
        "energy": 450,
        "top": 350,
        "bottom": 550,
        "size": 18,
        "world": 0.50,
    },
    "soft": {
        "energy": 520,
        "top": 460,
        "bottom": 520,
        "size": 26,
        "world": 0.58,
    },
    "dramatic": {
        "energy": 270,
        "top": 680,
        "bottom": 130,
        "size": 10,
        "world": 0.32,
    },
    "flat": {
        "energy": 620,
        "top": 620,
        "bottom": 620,
        "size": 30,
        "world": 0.65,
    },
}
preset = lighting_presets[render_settings["lighting"]]
light_power = render_settings["lightPower"]

for name, location in light_positions:
    data = bpy.data.lights.new(name, type="AREA")
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)

    light.location = location

    # Luz muito mais suave
    light.data.energy = preset["energy"] * light_power

    # Área muito maior = sombras suaves
    light.data.size = preset["size"]

# Pequenos ajustes
bpy.data.objects["Top_Light"].data.energy = preset["top"] * light_power
bpy.data.objects["Bottom_Light"].data.energy = preset["bottom"] * light_power

# Mundo neutro
world = bpy.context.scene.world or bpy.data.worlds.new("World")
bpy.context.scene.world = world
world.color = (preset["world"], preset["world"], preset["world"])

scene = bpy.context.scene
render_resolution = int(os.environ.get("REFAZER_RENDER_RESOLUTION", "768"))
scene.render.resolution_x = render_resolution
scene.render.resolution_y = render_resolution
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = render_settings["exposure"]
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
    "front_left.png": (-1, -1, 0),
    "front_right.png": (1, -1, 0),
    "back_left.png": (-1, 1, 0),
    "back_right.png": (1, 1, 0),
    "up.png": (0, 0, 1),
    "down.png": (0, 0, -1),
}

for filename, direction in views.items():
    look_at(cam, direction)
    scene.render.filepath = os.path.join(render_dir, filename)
    bpy.ops.render.render(write_still=True)

print("✅ Renders finalizados.")
