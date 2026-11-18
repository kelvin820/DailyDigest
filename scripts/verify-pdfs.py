"""Verify rendered PDFs against the exact shared payload and DOM layout proof."""
import argparse
import json
import pathlib
import re
import unicodedata
from pypdf import PdfReader

parser = argparse.ArgumentParser()
parser.add_argument('--manifest', default='output/preview/render-manifest.json')
args = parser.parse_args()
manifest_path = pathlib.Path(args.manifest).resolve()
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
assert len(manifest) == 6, 'Six files required'
assert len({(f['edition'], f['mode']) for f in manifest}) == 6
normalize = lambda s: re.sub(r'\s+', '', unicodedata.normalize('NFKC', s))
proofs = []
for file in manifest:
    path = pathlib.Path(file['path'])
    issue = json.loads(pathlib.Path(file['payloadPath']).read_text(encoding='utf-8'))
    story_count = issue.get('storyCount', 8)
    assert story_count in (4, 8) and len(issue['articles']) == story_count
    per_page = story_count // 2
    assert issue['edition'] == file['edition']
    assert issue['issueDate'] == file['issueDate'] and issue['revision'] == file['revision']
    assert issue['templateVersion'] == file['templateVersion']
    minimum = {'elementary': 13, 'junior': 12, 'senior': 11}[issue['edition']]
    reader = PdfReader(path)
    assert len(reader.pages) == 2, (path, 'page count')
    fonts = []
    texts, readable_texts = [], []
    for page in reader.pages:
        large_text = []
        def visitor(text, cm, tm, font, font_size):
            if font_size >= minimum - .1:
                large_text.append(text)
        texts.append(normalize(page.extract_text(visitor_text=visitor)))
        readable_texts.append(normalize(''.join(large_text)))
        for ref in page['/Resources'].get('/Font', {}).values():
            font = ref.get_object()
            descendants = font.get('/DescendantFonts')
            actual = descendants[0].get_object() if descendants else font
            descriptor = actual.get('/FontDescriptor')
            embedded = bool((descriptor and any(k in descriptor.get_object() for k in
                ['/FontFile', '/FontFile2', '/FontFile3'])) or
                (font.get('/Subtype') == '/Type3' and font.get('/CharProcs') and font.get('/ToUnicode')))
            fonts.append({'font': str(font.get('/BaseFont')), 'embedded': embedded})
    assert fonts and all(f['embedded'] for f in fonts), (path, 'font not embedded')
    for i, article in enumerate(issue['articles']):
        text = texts[i // per_page]
        assert normalize(article['headline']) in text, (path, article['storyId'], 'missing headline')
        for para in article['bodyParagraphs']:
            assert normalize(para) in text, (path, article['storyId'], 'missing body')
            assert normalize(para) in readable_texts[i // per_page], (path, article['storyId'], 'body below minimum font size')
        for vocab in article['vocabulary']:
            for key in ['term', 'definitionEn', 'meaningZhHant']:
                assert normalize(vocab[key]) in text, (path, 'missing vocabulary', key)
    assert len(file['layout']['articles']) == story_count
    assert all(a['fontPt'] >= minimum - .01 for a in file['layout']['articles'])
    file['textVerified'], file['fontsEmbedded'] = True, True
    proofs.append({'file': path.name, 'pages': 2, 'all_full_bodies_verified': True, 'story_count': story_count,
        'minimum_body_pt': minimum, 'pdf_body_size_verified': True, 'fonts': fonts})
# Only update verification flags after all six files have passed.
manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
proof_path = manifest_path.parent.parent / 'pdf-verification.json'
proof_path.write_text(json.dumps(proofs, indent=2), encoding='utf-8')
print('PASS: six two-page PDFs; all headlines, bodies and vocabulary; embedded fonts; minimum body sizes.')
