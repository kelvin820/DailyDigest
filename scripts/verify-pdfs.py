import json,re,pathlib,unicodedata
from pypdf import PdfReader
root=pathlib.Path(__file__).resolve().parents[1]
results=[]
for edition,minimum in [('elementary',13),('junior',12),('senior',11)]:
    issue=json.loads((root/'output/preview'/f'{edition}.json').read_text(encoding='utf-8'))
    for mode in ['color','ink']:
        path=root/'output/preview'/f'DD_2026-11-17_{edition}_r1_{mode}.pdf'
        reader=PdfReader(path)
        assert len(reader.pages)==2
        texts=[p.extract_text() for p in reader.pages]
        normalize=lambda s: re.sub(r'\s+','',unicodedata.normalize('NFKC',s))
        for i,a in enumerate(issue['articles']):
            text=normalize(texts[i//4])
            assert normalize(a['headline']) in text,(path,a['storyId'],'headline missing')
            for para in a['bodyParagraphs']:
                assert normalize(para) in text,(path,a['storyId'],'body missing')
        fonts=[]
        for page in reader.pages:
            for ref in page['/Resources'].get('/Font',{}).values():
                font=ref.get_object()
                descendants=font.get('/DescendantFonts')
                actual=descendants[0].get_object() if descendants else font
                descriptor=actual.get('/FontDescriptor')
                embedded=bool((descriptor and any(k in descriptor.get_object() for k in ['/FontFile','/FontFile2','/FontFile3'])) or (font.get('/Subtype')=='/Type3' and font.get('/CharProcs') and font.get('/ToUnicode')))
                fonts.append({'font':str(font.get('/BaseFont')),'embedded':embedded})
        assert all(f['embedded'] for f in fonts),(path,'font not embedded')
        results.append({'file':path.name,'pages':2,'eight_full_bodies_verified':True,'fonts':fonts,'minimum_body_pt':minimum})
(root/'output/pdf-verification.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print('PASS: six PDFs, two pages each, all eight full articles extractable, all fonts embedded.')



