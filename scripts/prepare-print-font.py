"""Remove duplicate radical aliases from an output font copy for correct PDF ToUnicode maps."""
from pathlib import Path
import sys
from fontTools.ttLib import TTFont

path = Path(sys.argv[1]).resolve()
paths = sorted(path.glob('*.ttf')) if path.is_dir() else [path]
for path in paths:
    font = TTFont(str(path))
    removed = 0
    for table in font['cmap'].tables:
        if not table.isUnicode() or not hasattr(table, 'cmap'):
            continue
        unified = {glyph for code, glyph in table.cmap.items()
                   if 0x3400 <= code <= 0x9FFF or 0x20000 <= code <= 0x323AF}
        # The same glyph can otherwise be mapped by Chromium to a CJK radical
        # (e.g. U+2EA0) instead of the actual Chinese character U+6C11 民.
        aliases = [code for code, glyph in table.cmap.items()
                   if 0x2E80 <= code <= 0x2FFF and glyph in unified]
        for code in aliases:
            del table.cmap[code]
        removed += len(aliases)
    if removed:
        temporary = path.with_suffix('.print.ttf')
        font.save(str(temporary))
        temporary.replace(path)
    font.close()
    print(f'Prepared output font copy: removed {removed} duplicate radical aliases; unified Chinese glyphs retained.')
