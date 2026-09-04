import {readState,writeState} from './store.js';
import {processCandle} from './strategy-server.js';
function auth(req){return !!process.env.INGEST_SECRET&&req.headers.authorization===`Bearer ${process.env.INGEST_SECRET}`}

export async function processIngestBody(state,body,processor=processCandle){
  const seed=!!body.seed;
  const jobs=[];
  if(body.candlesBySymbol&&typeof body.candlesBySymbol==='object'&&!Array.isArray(body.candlesBySymbol)){
    for(const [symbol,candle] of Object.entries(body.candlesBySymbol)){
      if(!symbol||!candle||typeof candle!=='object')continue;
      jobs.push([symbol,candle]);
    }
  }else if(body.symbol&&(body.candle||body.candles)){
    for(const candle of body.candles||[body.candle])jobs.push([body.symbol,candle]);
  }
  if(!jobs.length)throw Error('symbol and candle(s) required');
  let s=state,events=[];
  for(const [symbol,candle] of jobs){
    const out=await processor(s,symbol,candle,{seed});
    s=out.state;
    events.push(...out.events);
  }
  return {state:s,events};
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  if(!auth(req))return res.status(401).json({error:'Unauthorized'});
  try{
    const body=req.body||{};
    let s=await readState();
    const out=await processIngestBody(s,body);
    await writeState(out.state);
    res.status(200).json({ok:true,events:out.events});
  }catch(e){console.error('ingest failed',e);res.status(500).json({error:e.message})}
}
