import os
import sys

import bpy


input_path = sys.argv[-3]
output_path = sys.argv[-2]
max_size = int(sys.argv[-1])


def should_resize(image):
    if not image or image.type in {"RENDER_RESULT", "VIEWER"}:
        return False

    width, height = image.size
    return width > max_size or height > max_size


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

bpy.ops.import_scene.gltf(filepath=input_path)

resized = []

for image in list(bpy.data.images):
    if not should_resize(image):
        continue

    width, height = image.size
    scale = min(max_size / width, max_size / height)
    new_width = max(1, int(width * scale))
    new_height = max(1, int(height * scale))
    image.scale(new_width, new_height)
    image.pack()
    resized.append(f"{image.name}: {width}x{height} -> {new_width}x{new_height}")

os.makedirs(os.path.dirname(output_path), exist_ok=True)

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format="GLB",
    export_image_format="AUTO",
)

if resized:
    print("Roblox texture resize applied:")
    for item in resized:
        print(f"- {item}")
else:
    print("Roblox texture resize not needed.")
