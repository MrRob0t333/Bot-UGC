import os
import sys
import json
import colorsys

import bpy


if "--" in sys.argv:
    args = sys.argv[sys.argv.index("--") + 1:]
else:
    args = sys.argv[-5:]

input_path = args[0]
output_path = args[1]
max_size = int(args[2])
texture_tone = args[3] if len(args) > 3 else "normal"

try:
    tone_config = json.loads(args[4]) if len(args) > 4 else {}
except Exception:
    tone_config = {}

tone_value = float(tone_config.get("value", 1.0))
tone_saturation = float(tone_config.get("saturation", 1.0))
tone_gamma = float(tone_config.get("gamma", 1.0))


def should_resize(image):
    if not image or image.type in {"RENDER_RESULT", "VIEWER"}:
        return False

    width, height = image.size
    return width > max_size or height > max_size


def image_from_socket(socket, visited=None):
    if visited is None:
        visited = set()

    if not socket or not socket.is_linked:
        return None

    node = socket.links[0].from_node
    if node in visited:
        return None

    visited.add(node)

    if node.type == "TEX_IMAGE":
        return node.image

    for input_socket in node.inputs:
        found = image_from_socket(input_socket, visited)
        if found:
            return found

    return None


def base_color_images():
    images = set()

    for material in bpy.data.materials:
        if not material.use_nodes or not material.node_tree:
            continue

        for node in material.node_tree.nodes:
            if node.type != "BSDF_PRINCIPLED":
                continue

            socket = node.inputs.get("Base Color")
            image = image_from_socket(socket)
            if image:
                images.add(image)

    return images


def image_name_is_safe_color(image):
    name = (image.name or "").lower()
    blocked = ["normal", "rough", "metal", "metallic", "ao", "ambient", "height", "bump", "alpha", "opacity"]
    return not any(item in name for item in blocked)


def should_adjust_tone(image, color_images):
    if texture_tone == "normal":
        return False

    if not image or image.type in {"RENDER_RESULT", "VIEWER"}:
        return False

    if color_images:
        return image in color_images

    return image_name_is_safe_color(image)


def clamp01(value):
    return max(0.0, min(1.0, value))


def adjust_texture_tone(image):
    if tone_value == 1.0 and tone_saturation == 1.0 and tone_gamma == 1.0:
        return False

    pixels = list(image.pixels)
    changed = False

    for index in range(0, len(pixels), 4):
        r, g, b = pixels[index], pixels[index + 1], pixels[index + 2]
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        s = clamp01(s * tone_saturation)
        v = clamp01(v * tone_value)
        r, g, b = colorsys.hsv_to_rgb(h, s, v)

        if tone_gamma != 1.0:
            r = clamp01(r ** tone_gamma)
            g = clamp01(g ** tone_gamma)
            b = clamp01(b ** tone_gamma)

        pixels[index] = r
        pixels[index + 1] = g
        pixels[index + 2] = b
        changed = True

    if changed:
        image.pixels.foreach_set(pixels)
        image.pack()

    return changed


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

bpy.ops.import_scene.gltf(filepath=input_path)

resized = []
tone_adjusted = []
color_images = base_color_images()

for image in list(bpy.data.images):
    width, height = image.size

    if should_resize(image):
        scale = min(max_size / width, max_size / height)
        new_width = max(1, int(width * scale))
        new_height = max(1, int(height * scale))
        image.scale(new_width, new_height)
        image.pack()
        resized.append(f"{image.name}: {width}x{height} -> {new_width}x{new_height}")

    if should_adjust_tone(image, color_images) and adjust_texture_tone(image):
        tone_adjusted.append(f"{image.name}: {texture_tone}")

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

if tone_adjusted:
    print("Roblox texture tone applied:")
    for item in tone_adjusted:
        print(f"- {item}")
else:
    print("Roblox texture tone not changed.")
