from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
dest=root.parent/'outputs'/'DayDay_M1_Review_and_Source.zip'
dest.parent.mkdir(exist_ok=True)
skip={'.git','node_modules','.next','.pnpm-store','.runtime'}
with ZipFile(dest,'w',ZIP_DEFLATED,compresslevel=6) as z:
 for p in root.rglob('*'):
  if not p.is_file() or any(s in skip for s in p.relative_to(root).parts):continue
  if p.name.startswith('.env') and p.name!='.env.example':continue
  if p.suffix=='.tsbuildinfo':continue
  z.write(p,'dayday/'+str(p.relative_to(root)).replace('\\','/'))
print(str(dest))
print(dest.stat().st_size)

