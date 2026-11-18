"""Copy a verified image preview for static hosting, with one shared font subset.

Does not copy original downloads, API keys, screenshots, or unverified image API bytes.
"""
import json
from pathlib import Path
import shutil
import sys
from fontTools import subset

source, target = [Path(p).resolve() for p in sys.argv[1:]]
report = json.loads((source / 'image-report.json').read_text())
qa = json.loads((source / 'qa/verification.json').read_text())
if not report['pdfVerified'] or qa['status'] != 'passed':
    raise RuntimeError('Verified PDF and responsive QA required before packaging')
if source == target or source in target.parents or target in source.parents:
    raise RuntimeError('Source and destination must be separate')
target.mkdir(parents=True, exist_ok=True)
for path in source.glob('*.html'):
    shutil.copy2(path, target / path.name)
for name in ['media-fallback.js', 'report.json', 'checkpoints.json', 'developer-corrections.json',
             'image-report.json', 'nvidia-image-report.json', 'nvidia-image-history.json']:
    if (source / name).exists():
        shutil.copy2(source / name, target / name)
shutil.copytree(source / 'assets', target / 'assets', dirs_exist_ok=True)
for directory in source.glob('pdf-*'):
    if not directory.is_dir():
        continue
    destination = target / directory.name
    destination.mkdir(exist_ok=True)
    for path in directory.iterdir():
        if path.suffix in ['.pdf', '.json']:
            shutil.copy2(path, destination / path.name)
        elif path.suffix == '.html':
            (destination / path.name).write_text(path.read_text().replace('fonts/', '../fonts/'))
    assets = set()
    for path in [directory / (key + '.json') for key in ['elementary', 'junior', 'senior']]:
        issue = json.loads(path.read_text())
        for article in issue['articles']:
            rendition = article['image'].get('rendition', {})
            assets.update(rendition.get(key) for key in ['webPath', 'printPath'] if rendition.get(key))
    for name in assets:
        out = destination / name
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(directory / name, out)
text = ''.join(path.read_text() for path in target.rglob('*.html'))
fonts = target / 'fonts'
fonts.mkdir(exist_ok=True)
for path in (source / 'fonts').iterdir():
    if path.suffix != '.ttf':
        shutil.copy2(path, fonts / path.name)
        continue
    original = Path(__file__).resolve().parents[1] / 'public/fonts' / path.name
    font = subset.load_font(str(original), subset.Options())
    operation = subset.Subsetter()
    operation.populate(text=text)
    operation.subset(font)
    subset.save_font(font, str(fonts / path.name), subset.Options())
shutil.copy2(source / 'qa/verification.json', target / 'responsive-verification.json')
print(json.dumps({'directory': str(target), 'files': sum(1 for p in target.rglob('*') if p.is_file())}))
