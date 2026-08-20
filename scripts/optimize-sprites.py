import json
import shutil
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public" / "sprites"
DOCS = ROOT / "docs" / "sprites"
CATALOG = json.loads((ROOT / "data" / "catalog.json").read_text(encoding="utf-8"))


def filename(name: str, variant: str) -> str:
    family = name.lower().replace(".", "").replace(" ", "-")
    style = variant.lower().replace(" ", "-")
    return f"{family}-{style}-256.webp"


before = 0
after = 0
for family in CATALOG["families"]:
    for variant in family["variants"]:
        source = PUBLIC / filename(family["name"], variant)
        target = DOCS / source.name
        temporary = source.with_suffix(".optimized.webp")
        before += source.stat().st_size
        with Image.open(source) as image:
            image.save(temporary, "WEBP", quality=84, method=6, exact=True)
        if temporary.stat().st_size < source.stat().st_size:
            temporary.replace(source)
        else:
            temporary.unlink()
        shutil.copy2(source, target)
        after += source.stat().st_size

print(f"Optimized {after / 1024:.0f} KB from {before / 1024:.0f} KB ({(1 - after / before) * 100:.1f}% smaller).")
