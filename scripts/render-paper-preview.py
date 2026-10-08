"""Render the bundled engineering PDF into stable, lazy-loadable preview pages.

Requires Poppler's pdftoppm and Pillow. The PDF remains the download/print copy.
"""

from pathlib import Path
import os
import shutil
import subprocess
import tempfile

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/papers/routing-efficiency.pdf"
DESTINATION = ROOT / "public/papers/pages"
EXPECTED_PAGES = 24


def main() -> None:
    renderer = shutil.which("pdftoppm")
    if not renderer:
        raise SystemExit("Install Poppler (pdftoppm) to render the paper preview.")

    with tempfile.TemporaryDirectory(prefix="spacedata-paper-") as temporary:
        work = Path(temporary)
        fonts = work / "fonts.conf"
        fonts.write_text(
            '<?xml version="1.0"?><fontconfig>'
            "<dir>/System/Library/Fonts</dir><dir>/Library/Fonts</dir>"
            "<dir>/usr/share/fonts</dir>"
            f"<cachedir>{work / 'font-cache'}</cachedir>"
            "</fontconfig>"
        )
        environment = os.environ.copy()
        environment["FONTCONFIG_FILE"] = str(fonts)
        subprocess.run(
            [renderer, "-r", "160", "-png", str(SOURCE), str(work / "page")],
            check=True,
            env=environment,
        )

        pages = sorted(work.glob("page-*.png"))
        if len(pages) != EXPECTED_PAGES:
            raise SystemExit(
                f"Expected {EXPECTED_PAGES} pages; rendered {len(pages)}. "
                "Update the viewer's page count before publishing."
            )
        DESTINATION.mkdir(parents=True, exist_ok=True)
        for index, page in enumerate(pages, start=1):
            with Image.open(page) as image:
                if image.size != (1360, 1760):
                    raise SystemExit(f"Unexpected page size on page {index}: {image.size}")
                image.convert("RGB").save(
                    DESTINATION / f"page-{index:02d}.webp",
                    "WEBP",
                    quality=90,
                    method=6,
                )
        print(f"Rendered {len(pages)} preview pages to {DESTINATION}")


if __name__ == "__main__":
    main()
