#!/usr/bin/env python3
"""Draw the My Day home-screen icon. No third-party libraries."""
import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "public" / "icons"
BG = (31, 107, 69, 255)
CREAM = (246, 231, 180, 255)


def write_png(path, size, rgba):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + bytes(rgba[y * size * 4:(y + 1) * size * 4]) for y in range(size))
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def fill_circle(buf, size, cx, cy, radius, color):
    r2 = radius * radius
    x0, x1 = int(cx - radius - 1), int(cx + radius + 1)
    y0, y1 = int(cy - radius - 1), int(cy + radius + 1)
    for y in range(max(0, y0), min(size, y1 + 1)):
        for x in range(max(0, x0), min(size, x1 + 1)):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r2:
                i = (y * size + x) * 4
                buf[i:i + 4] = bytes(color)


def draw(size, scale):
    buf = bytearray(BG * (size * size))
    cx = cy = (size - 1) / 2
    arm = size * 0.030 * scale
    inner = size * 0.20 * scale
    outer = size * 0.38 * scale
    for k in range(12):
        ang = math.radians(k * 30 - 90)
        steps = max(8, int(size * 0.25))
        for step in range(steps + 1):
            dist = inner + (outer - inner) * (step / steps)
            fill_circle(buf, size, cx + math.cos(ang) * dist, cy + math.sin(ang) * dist, arm, CREAM)
    fill_circle(buf, size, cx, cy, size * 0.145 * scale, CREAM)
    return buf


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    write_png(ROOT / "icon-512.png", 512, draw(512, 1))
    write_png(ROOT / "icon-192.png", 192, draw(192, 1))
    write_png(ROOT / "apple-touch-icon.png", 180, draw(180, 1))
    write_png(ROOT / "icon-maskable-512.png", 512, draw(512, 0.78))
    print("wrote icons")


if __name__ == "__main__":
    main()
