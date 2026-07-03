import bpy, sys, os

obj_path = sys.argv[-3]
texture_path = sys.argv[-2]
glb_path = sys.argv[-1]

def load_fixed_texture(path):
    if not path or not os.path.exists(path):
        return None

    img = bpy.data.images.load(path)
    img.alpha_mode = "CHANNEL_PACKED"

    # Força textura opaca para evitar vazamento de pixels transparentes
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

    img = load_fixed_texture(texture_path)

    if img:
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.extension = "CLIP"
        tex.interpolation = "Linear"

        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

for obj in objs:
    obj.data.materials.clear()
    obj.data.materials.append(mat)

bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format="GLB",
    export_image_format="AUTO",
    export_materials="EXPORT"
)