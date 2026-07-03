import bpy, sys, os, math
from mathutils import Vector

obj_path = sys.argv[-3]
texture_path = sys.argv[-2]
render_dir = sys.argv[-1]

os.makedirs(render_dir, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

bpy.ops.wm.obj_import(filepath=obj_path)

objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]

mat = bpy.data.materials.new("UGC_Material")
mat.use_nodes = True
mat.blend_method = "CLIP"
mat.alpha_threshold = 0.5
mat.show_transparent_back = True

bsdf = mat.node_tree.nodes.get("Principled BSDF")

if bsdf:
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Metallic"].default_value = 0
    bsdf.inputs["Roughness"].default_value = 1
    bsdf.inputs["Alpha"].default_value = 1

    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = 1

    if texture_path and os.path.exists(texture_path):
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(texture_path)
        tex.extension = "CLIP"

        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

        if "Alpha" in tex.outputs:
            mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])

for obj in objs:
    obj.data.materials.clear()
    obj.data.materials.append(mat)

# Centralizar modelo
bpy.ops.object.select_all(action="DESELECT")
for obj in objs:
    obj.select_set(True)
bpy.context.view_layer.objects.active = objs[0]

bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")

mins = Vector((999999, 999999, 999999))
maxs = Vector((-999999, -999999, -999999))

for obj in objs:
    for corner in obj.bound_box:
        world = obj.matrix_world @ Vector(corner)
        mins.x = min(mins.x, world.x)
        mins.y = min(mins.y, world.y)
        mins.z = min(mins.z, world.z)
        maxs.x = max(maxs.x, world.x)
        maxs.y = max(maxs.y, world.y)
        maxs.z = max(maxs.z, world.z)

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

# Luz
light_data = bpy.data.lights.new("Key_Light", type="AREA")
light = bpy.data.objects.new("Key_Light", light_data)
bpy.context.collection.objects.link(light)
light.location = (0, -4, 4)
light.data.energy = 500
light.data.size = 5

# Mundo
world = bpy.context.scene.world or bpy.data.worlds.new("World")
bpy.context.scene.world = world
world.color = (0.18, 0.18, 0.18)

# Render
scene = bpy.context.scene
scene.render.resolution_x = 1024
scene.render.resolution_y = 1024
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except Exception:
    scene.render.engine = "BLENDER_EEVEE"

def look_at_camera(camera, direction):
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
    look_at_camera(cam, direction)
    scene.render.filepath = os.path.join(render_dir, filename)
    bpy.ops.render.render(write_still=True)

print("✅ Renders finalizados.")