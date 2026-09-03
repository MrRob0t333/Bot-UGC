import sys
from pathlib import Path

from PIL import Image, ImageEnhance


BRIGHTNESS_FACTOR = 0.95  # Photopea-style brightness: -5
CONTRAST_FACTOR = 1.10    # Photopea-style contrast: +10


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: adjust_texture_photopea.py input output")

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    output_path.parent.mkdir(parents=True, exist_ok=True)

    image = Image.open(input_path).convert("RGBA")
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    rgb = ImageEnhance.Brightness(rgb).enhance(BRIGHTNESS_FACTOR)
    rgb = ImageEnhance.Contrast(rgb).enhance(CONTRAST_FACTOR)
    result = rgb.convert("RGBA")
    result.putalpha(alpha)
    result.save(output_path, format="PNG")


if __name__ == "__main__":
    main()
