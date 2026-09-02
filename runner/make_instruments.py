import json,os
master=os.environ.get('INSTRUMENT_MASTER_FILE','OpenAPIScripMaster.json');universe=os.environ.get('UNIVERSE_FILE','universe_symbols.txt')
with open(master,encoding='utf-8') as f:data=json.load(f)
with open(universe,encoding='utf-8') as f:wanted={x.strip().upper() for x in f if x.strip()}
uniq={}
for x in data:
 if str(x.get('exch_seg','')).upper()!='NSE':continue
 sym=str(x.get('symbol','')).upper();base=sym.replace('-EQ','');token=x.get('token')
 if base in wanted and token:uniq.setdefault(base,{'symbol':base,'token':str(token)})
with open('instruments.json','w',encoding='utf-8') as f:json.dump(sorted(uniq.values(),key=lambda x:x['symbol']),f,indent=2)
print(f'Wrote {len(uniq)} instruments to instruments.json')
missing=wanted-set(uniq)
if missing:print('Missing:',', '.join(sorted(missing)))
