import bpy, sys, os

obj_path = sys.argv[-3]
texture_path = sys.argv[-2]
glb_path = sys.argv[-1]

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

bpy.ops.wm.obj_import(filepath=obj_path)

objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]

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

bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format="GLB",
    export_image_format="AUTO",
    export_materials="EXPORT",
)