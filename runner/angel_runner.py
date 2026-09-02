from dotenv import load_dotenv
load_dotenv()


import os,json,time,datetime as dt,threading,queue,requests,pyotp
from SmartApi import SmartConnect
from SmartApi.smartWebSocketV2 import SmartWebSocketV2
from angel_rate_limit import seed_candle_request

IST=dt.timezone(dt.timedelta(hours=5,minutes=30))
BASE=os.environ.get('SCANNER_BASE_URL','').rstrip('/')
SECRET=os.environ.get('SCANNER_INGEST_SECRET','')
API_KEY=os.environ.get('ANGEL_API_KEY','');CLIENT=os.environ.get('ANGEL_CLIENT_CODE','');PWD=os.environ.get('ANGEL_PASSWORD','');TOTP_SECRET=os.environ.get('ANGEL_TOTP_SECRET','')
INSTRUMENTS=os.environ.get('INSTRUMENTS_FILE','instruments.json')
if not BASE or not SECRET: raise SystemExit('Safety stop: set SCANNER_BASE_URL and SCANNER_INGEST_SECRET before starting.')
if not all([API_KEY,CLIENT,PWD,TOTP_SECRET]): raise SystemExit('Safety stop: set all ANGEL_* credentials before starting.')
with open(INSTRUMENTS,encoding='utf-8') as f: instruments=json.load(f)
if not instruments: raise SystemExit('No instruments configured.')
HEAD={'Authorization':f'Bearer {SECRET}','Content-Type':'application/json'}

def post(path,payload):
 r=requests.post(BASE+path,headers=HEAD,json=payload,timeout=30);r.raise_for_status();return r.json()

smart=SmartConnect(api_key=API_KEY)
session=smart.generateSession(CLIENT,PWD,pyotp.TOTP(TOTP_SECRET).now())
auth=session['data']['jwtToken'];feed=session['data']['feedToken']

def seed():
 now=dt.datetime.now(IST);from_dt=now-dt.timedelta(days=5)
 for i,x in enumerate(instruments,1):
  try:
   p={'exchange':'NSE','symboltoken':str(x['token']),'interval':'FIVE_MINUTE','fromdate':from_dt.strftime('%Y-%m-%d %H:%M'),'todate':now.strftime('%Y-%m-%d %H:%M')}
   raw=seed_candle_request(lambda: smart.getCandleData(p)).get('data') or [];candles=[]
   current_bucket=now.replace(minute=(now.minute//5)*5,second=0,microsecond=0)
   for row in raw:
    t=dt.datetime.fromisoformat(str(row[0]).replace('Z','+00:00'))
    if t.tzinfo is None:t=t.replace(tzinfo=IST)
    t=t.astimezone(IST)
    if t>=current_bucket:continue
    candles.append({'time':t.isoformat(),'open':float(row[1]),'high':float(row[2]),'low':float(row[3]),'close':float(row[4])})
   if candles:post('/api/ingest',{'symbol':x['symbol'],'candles':candles[-100:],'seed':True})
   print(f'Seed {i}/{len(instruments)} {x["symbol"]}: {len(candles[-100:])}',flush=True)
  except Exception as e:print(f'Seed failed {x["symbol"]}: {e}',flush=True)

by_token={str(x['token']):x['symbol'] for x in instruments}
ws=SmartWebSocketV2(auth,API_KEY,CLIENT,feed)
current={};lock=threading.Lock();last_hard_exit_date=None
post_queue=queue.Queue()

def bucket(ts):
 t=dt.datetime.fromtimestamp(ts/1000,tz=IST);return t.replace(minute=(t.minute//5)*5,second=0,microsecond=0)
def worker():
 while True:
  symbol,bar=post_queue.get()
  try:post('/api/ingest',{'symbol':symbol,'candle':bar});print('5m',symbol,bar['time'],bar['close'],flush=True)
  except Exception as e:print('post failed',symbol,e,flush=True)
  finally:post_queue.task_done()

def on_data(data):
 try:
  token=str(data['token']);symbol=by_token.get(token)
  if not symbol:return
  px=float(data['last_traded_price'])/100;ts=int(data.get('exchange_timestamp') or time.time()*1000);b=bucket(ts);key=b.isoformat()
  with lock:
   old=current.get(symbol)
   if old and old['time']!=key:
    finished=current.pop(symbol);post_queue.put((symbol,finished))
   x=current.get(symbol)
   if x is None:current[symbol]={'time':key,'open':px,'high':px,'low':px,'close':px}
   else:x['high']=max(x['high'],px);x['low']=min(x['low'],px);x['close']=px
 except Exception as e:print('tick error',e,flush=True)

def hard_exit_loop():
 global last_hard_exit_date
 while True:
  now=dt.datetime.now(IST)
  if now.hour==15 and now.minute>=13 and last_hard_exit_date!=now.date():
   with lock:prices={s:b['close'] for s,b in current.items()}
   for s,p in prices.items():
    try:post('/api/ingest',{'symbol':s,'candle':{'time':now.isoformat(),'open':p,'high':p,'low':p,'close':p,'hard_exit':True}})
    except Exception as e:print('hard exit post failed',s,e,flush=True)
   last_hard_exit_date=now.date()
  time.sleep(5)

def on_open():
 print(f'Connected. Subscribing {len(instruments)} symbols.',flush=True)
 ws.subscribe('inside50',1,[{'exchangeType':1,'tokens':[str(x['token']) for x in instruments]}])
def on_error(*args):print('WS error',args,flush=True)
def on_close(*args):print('WS closed',args,flush=True)
ws.on_data=on_data;ws.on_open=on_open;ws.on_error=on_error;ws.on_close=on_close

if __name__=='__main__':
 threading.Thread(target=worker,daemon=True).start();seed();threading.Thread(target=hard_exit_loop,daemon=True).start();ws.connect()
