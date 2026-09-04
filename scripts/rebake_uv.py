import sys
from pathlib import Path

import bpy


def fail(message):
    raise RuntimeError(message)


def has_transparency(image):
    if image.channels < 4:
        return False
    pixels = image.pixels[:]
    return any(pixels[index] < 0.999 for index in range(3, len(pixels), 4))


def color_range(image):
    pixels = image.pixels[:]
    colors = pixels[0::4] + pixels[1::4] + pixels[2::4]
    return max(colors) - min(colors) if colors else 0


def main():
    if len(sys.argv) < 6:
        fail("usage: rebake_uv.py input.obj source.png output.png output.glb [size]")

    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    if len(args) < 4:
        fail("missing rebake arguments")

    obj_path = Path(args[0]).resolve()
    source_path = Path(args[1]).resolve()
    output_texture = Path(args[2]).resolve()
    output_glb = Path(args[3]).resolve()
    size = max(64, min(1024, int(float(args[4]))) if len(args) > 4 else 1024)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.wm.obj_import(filepath=str(obj_path))

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        fail("safe UV rebake requires exactly one mesh object")
    mesh = meshes[0]
    if len(mesh.data.uv_layers) != 1:
        fail("safe UV rebake requires exactly one existing UV map")
    if len(mesh.data.materials) > 1:
        fail("safe UV rebake requires at most one material")

    source_image = bpy.data.images.load(str(source_path), check_existing=False)
    if has_transparency(source_image):
        fail("safe UV rebake does not change transparent textures")

    original_uv = mesh.data.uv_layers.active
    original_uv.name = "VelvetOriginalUV"
    rebaked_uv = mesh.data.uv_layers.new(name="VelvetRepackedUV")
    mesh.data.uv_layers.active = rebaked_uv

    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15192, island_margin=0.03, correct_aspect=True, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")

    material = bpy.data.materials.new(name="VelvetRebakeSource")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    source = nodes.new("ShaderNodeTexImage")
    source.image = source_image
    source_uv = nodes.new("ShaderNodeUVMap")
    source_uv.uv_map = original_uv.name
    target = nodes.new("ShaderNodeTexImage")
    target_image = bpy.data.images.new("VelvetRebakedTexture", width=size, height=size, alpha=True)
    target.image = target_image
    target.select = True
    nodes.active = target
    links.new(source_uv.outputs["UV"], source.inputs["Vector"])
    links.new(source.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    mesh.data.materials.clear()
    mesh.data.materials.append(material)

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.render.image_settings.file_format = "PNG"
    scene.render.bake.margin = 16
    bpy.ops.object.bake(type="EMIT", use_clear=True, margin=16)

    if color_range(source_image) > 0.02 and color_range(target_image) < 0.005:
        fail("UV bake produced an empty texture; original asset was preserved")

    output_texture.parent.mkdir(parents=True, exist_ok=True)
    target_image.filepath = str(output_texture)
    target_image.filepath_raw = str(output_texture)
    target_image.file_format = "PNG"
    target_image.save()
    target_image.pack()

    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    baked = nodes.new("ShaderNodeTexImage")
    baked.image = target_image
    links.new(baked.outputs["Color"], principled.inputs["Base Color"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    output_glb.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output_glb),
        export_format="GLB",
        export_materials="EXPORT",
        export_image_format="AUTO",
    )


if __name__ == "__main__":
    main()
