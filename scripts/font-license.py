import struct,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
for filename in ['NotoSansTC.ttf','Newsreader.ttf']:
 data=(root/'public/fonts'/filename).read_bytes()
 count=struct.unpack_from('>H',data,4)[0];offset=None
 for i in range(count):
  tag,check,start,length=struct.unpack_from('>4sIII',data,12+16*i)
  if tag==b'name':offset=start
 fmt,n,strings=struct.unpack_from('>HHH',data,offset)
 rows={}
 for i in range(n):
  platform,encoding,lang,name,length,pos=struct.unpack_from('>HHHHHH',data,offset+6+12*i)
  if name in (0,1,13,14):
   raw=data[offset+strings+pos:offset+strings+pos+length]
   value=raw.decode('utf-16-be' if platform in (0,3) else 'latin-1')
   rows[name]=value
 text='\n\n'.join(str(k)+': '+v for k,v in rows.items())
 (root/'public/fonts'/(filename+'.license.txt')).write_text(text,encoding='utf-8')
 print(filename,rows.get(1),rows.get(14),len(rows.get(13,'')))

