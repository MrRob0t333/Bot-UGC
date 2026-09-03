import sys
from pathlib import Path

from PIL import Image, ImageEnhance


DEFAULT_BRIGHTNESS = -5
DEFAULT_CONTRAST = 10
DEFAULT_SATURATION = 1.0


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def main():
    if not 3 <= len(sys.argv) <= 7:
        raise SystemExit("usage: adjust_texture_photopea.py input output [brightness] [contrast] [saturation] [max_dimension]")

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    brightness = clamp(float(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_BRIGHTNESS, -25, 25)
    contrast = clamp(float(sys.argv[4]) if len(sys.argv) > 4 else DEFAULT_CONTRAST, -20, 40)
    saturation = clamp(float(sys.argv[5]) if len(sys.argv) > 5 else DEFAULT_SATURATION, 0, 2.5)
    max_dimension = int(clamp(float(sys.argv[6]) if len(sys.argv) > 6 else 1024, 64, 1024))
    output_path.parent.mkdir(parents=True, exist_ok=True)

    image = Image.open(input_path).convert("RGBA")
    current_max = max(image.size)
    if current_max != max_dimension:
        scale = max_dimension / current_max
        size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        image = image.resize(size, Image.Resampling.LANCZOS)
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    rgb = ImageEnhance.Brightness(rgb).enhance(1 + brightness / 100)
    rgb = ImageEnhance.Contrast(rgb).enhance(1 + contrast / 100)
    rgb = ImageEnhance.Color(rgb).enhance(saturation)
    result = rgb.convert("RGBA")
    result.putalpha(alpha)
    result.save(output_path, format="PNG")


if __name__ == "__main__":
    main()
