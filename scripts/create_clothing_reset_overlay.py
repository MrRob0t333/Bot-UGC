import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def scaled_box(box, width, height):
    x1, y1, x2, y2 = box
    return (
        round(x1 * width / 585),
        round(y1 * height / 559),
        round(x2 * width / 585),
        round(y2 * height / 559),
    )


def draw_label(draw, box, text, fill):
    x1, y1, x2, y2 = box
    try:
        font = ImageFont.truetype("arial.ttf", max(10, round((y2 - y1) * 0.12)))
    except Exception:
        font = ImageFont.load_default()

    draw.rectangle((x1 + 3, y1 + 3, min(x2 - 3, x1 + 12 + len(text) * 7), y1 + 21), fill=(0, 0, 0, 135))
    draw.text((x1 + 7, y1 + 6), text, fill=fill, font=font)


def template_overlay_layer(template_path, size):
    return Image.open(template_path).convert("RGBA").resize(size, Image.LANCZOS)


def main():
    if len(sys.argv) < 3:
        raise SystemExit("usage: create_clothing_reset_overlay.py input output")

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    output_path.parent.mkdir(parents=True, exist_ok=True)

    template_path = Path(sys.argv[3]) if len(sys.argv) >= 4 else None
    image = Image.open(input_path).convert("RGBA")
    width, height = image.size
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))

    if template_path and template_path.exists():
        overlay = Image.alpha_composite(overlay, template_overlay_layer(template_path, image.size))
        result = Image.alpha_composite(image, overlay).convert("RGBA")
        result.save(output_path)
        return

    draw = ImageDraw.Draw(overlay, "RGBA")

    # Roblox classic clothing templates are commonly 585x559. These boxes are
    # normalized from that layout and scaled to the actual uploaded image size.
    sections = [
        ((231, 74, 359, 202), "FRONT", (65, 180, 255, 95), (65, 180, 255, 230)),
        ((231, 203, 359, 331), "BACK", (255, 94, 94, 90), (255, 94, 94, 230)),
        ((102, 74, 230, 202), "LEFT", (105, 255, 150, 85), (105, 255, 150, 230)),
        ((360, 74, 488, 202), "RIGHT", (105, 255, 150, 85), (105, 255, 150, 230)),
        ((231, 0, 359, 73), "TOP", (255, 214, 80, 80), (255, 214, 80, 230)),
        ((231, 332, 359, 459), "BOTTOM", (255, 214, 80, 75), (255, 214, 80, 230)),
        ((102, 332, 230, 459), "ARM", (188, 120, 255, 70), (188, 120, 255, 220)),
        ((360, 332, 488, 459), "ARM", (188, 120, 255, 70), (188, 120, 255, 220)),
    ]

    line_width = max(2, round(min(width, height) * 0.006))

    for raw_box, label, fill, outline in sections:
        box = scaled_box(raw_box, width, height)
        draw.rectangle(box, fill=fill, outline=outline, width=line_width)
        draw_label(draw, box, label, outline)

    # Add alignment guides so users can see the reset/template structure clearly.
    for x in [width / 4, width / 2, width * 3 / 4]:
        draw.line((x, 0, x, height), fill=(255, 255, 255, 55), width=1)
    for y in [height / 4, height / 2, height * 3 / 4]:
        draw.line((0, y, width, y), fill=(255, 255, 255, 55), width=1)

    try:
        title_font = ImageFont.truetype("arial.ttf", max(14, round(height * 0.035)))
    except Exception:
        title_font = ImageFont.load_default()

    draw.rectangle((8, 8, min(width - 8, 210), 38), fill=(0, 0, 0, 155))
    draw.text((16, 14), "RESET TEMPLATE", fill=(255, 255, 255, 235), font=title_font)

    result = Image.alpha_composite(image, overlay).convert("RGBA")
    result.save(output_path)


if __name__ == "__main__":
    main()
