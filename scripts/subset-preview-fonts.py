"""Subset only the generated preview's font copies; keep original fonts untouched."""
from pathlib import Path
import sys
from fontTools import subset

root = Path(sys.argv[1]).resolve()
text = ''.join(path.read_text() for path in root.rglob('*.html'))
if not text:
    raise RuntimeError('Preview HTML required')
for path in (root / 'fonts').glob('*.ttf'):
    font = subset.load_font(str(path), subset.Options())
    operation = subset.Subsetter()
    operation.populate(text=text)
    operation.subset(font)
    temporary = path.with_suffix('.subset.ttf')
    subset.save_font(font, str(temporary), subset.Options())
    temporary.replace(path)
print('Preview font copies subset; original fonts and licenses preserved.')
