import bpy, sys, os, math
from mathutils import Vector

obj_path = sys.argv[-3]
texture_path = sys.argv[-2]
out_dir = sys.argv[-1]

os.makedirs(out_dir, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

bpy.ops.wm.obj_import(filepath=obj_path)

objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]

if not objs:
    raise Exception("Nenhum mesh importado")

for obj in objs:
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()

# Material
mat = bpy.data.materials.new("UGC_Material")
mat.use_nodes = True

bsdf = mat.node_tree.nodes.get("Principled BSDF")

if bsdf:
    bsdf.inputs["Metallic"].default_value = 0
    bsdf.inputs["Roughness"].default_value = 1
    bsdf.inputs["Alpha"].default_value = 1
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)

    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = 1

    if texture_path and os.path.exists(texture_path):
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(texture_path)
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

        if "Alpha" in tex.outputs:
            mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])

for obj in objs:
    obj.data.materials.clear()
    obj.data.materials.append(mat)

# Bounds
bpy.context.view_layer.update()

min_corner = Vector((999999, 999999, 999999))
max_corner = Vector((-999999, -999999, -999999))

for obj in objs:
    for corner in obj.bound_box:
        world = obj.matrix_world @ Vector(corner)
        min_corner.x = min(min_corner.x, world.x)
        min_corner.y = min(min_corner.y, world.y)
        min_corner.z = min(min_corner.z, world.z)
        max_corner.x = max(max_corner.x, world.x)
        max_corner.y = max(max_corner.y, world.y)
        max_corner.z = max(max_corner.z, world.z)

center = (min_corner + max_corner) / 2
size = max_corner - min_corner
max_size = max(size.x, size.y, size.z)

for obj in objs:
    obj.location -= center

bpy.context.view_layer.update()

# Iluminação estilo estúdio
bpy.ops.object.light_add(type="AREA", location=(0, -4, 4))
key = bpy.context.object
key.data.energy = 2500
key.data.size = 6

bpy.ops.object.light_add(type="AREA", location=(4, -2, 3))
fill = bpy.context.object
fill.data.energy = 900
fill.data.size = 8

bpy.ops.object.light_add(type="AREA", location=(-3, 3, 5))
rim = bpy.context.object
rim.data.energy = 700
rim.data.size = 8

# World mais claro
world = bpy.context.scene.world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.65, 0.65, 0.65, 1)
bg.inputs[1].default_value = 0.8

# Câmera ortográfica estilo Blender
bpy.ops.object.camera_add()
cam = bpy.context.object
bpy.context.scene.camera = cam
cam.data.type = "ORTHO"
cam.data.ortho_scale = max_size * 1.15

# Render settings
bpy.context.scene.render.resolution_x = 1024
bpy.context.scene.render.resolution_y = 1024
bpy.context.scene.render.film_transparent = True

# Color management
bpy.context.scene.view_settings.view_transform = "Standard"
bpy.context.scene.view_settings.look = "None"
bpy.context.scene.view_settings.exposure = 0.8
bpy.context.scene.view_settings.gamma = 1

try:
    bpy.context.scene.eevee.taa_render_samples = 64
except Exception:
    pass

def set_camera_view(name):
    distance = max_size * 3

    if name == "frente":
        cam.location = (0, -distance, 0)
        cam.rotation_euler = (math.radians(90), 0, 0)

    elif name == "costas":
        cam.location = (0, distance, 0)
        cam.rotation_euler = (math.radians(90), 0, math.radians(180))

    elif name == "direita":
        cam.location = (distance, 0, 0)
        cam.rotation_euler = (math.radians(90), 0, math.radians(90))

    elif name == "esquerda":
        cam.location = (-distance, 0, 0)
        cam.rotation_euler = (math.radians(90), 0, math.radians(-90))

    elif name == "isometrica":
        cam.location = (distance, -distance, distance * 0.65)
        direction = Vector((0, 0, 0)) - Vector(cam.location)
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

views = ["frente", "direita", "costas", "esquerda", "isometrica"]

for view in views:
    set_camera_view(view)
    bpy.context.scene.render.filepath = os.path.join(out_dir, f"{view}.png")
    bpy.ops.render.render(write_still=True)