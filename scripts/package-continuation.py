"""Two independently transferable archives; no credentials, build cache or duplicate fonts."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
destination = Path('/workspace/deliverables')
destination.mkdir(parents=True, exist_ok=True)
excluded = {'.git', '.next', '.runtime', 'node_modules', 'output', '__pycache__', '.venv', '.pnpm-store'}
source = destination / 'DayDay_Source_2026-11-18.zip'
review = destination / 'DayDay_Review_2026-11-18.zip'
with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if not path.is_file() or path.is_symlink() or any(p in excluded for p in relative.parts):
            continue
        if path.name.endswith('.tsbuildinfo') or (path.name.startswith('.env') and path.name != '.env.example'):
            continue
        archive.write(path, Path('dayday-daily-digest') / relative)
with zipfile.ZipFile(review, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted((root / 'output').rglob('*')):
        relative = path.relative_to(root)
        if path.is_file() and not path.is_symlink() and 'fonts' not in relative.parts:
            archive.write(path, Path('dayday-daily-digest') / relative)
    archive.writestr('REVIEW_README.txt',
        'All six PDFs are DEMO fictional stories, not live publication.\n'
        'PDFs include embedded fonts and open independently.\n'
        'Extract source and review archives side by side. To restore preview fonts,\n'
        'run node scripts/offline.mjs inside dayday-daily-digest.\n'
        'No real API keys, Supabase instance or production deployment are included.\n')
manifest = []
for path in [source, review]:
    assert path.stat().st_size < 32 * 1024 * 1024, (path, 'exceeds upload transfer limit')
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        assert not any('/.env.local' in name or '/.git/' in name for name in archive.namelist())
    manifest.append({'file': path.name, 'bytes': path.stat().st_size,
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
(destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2))
