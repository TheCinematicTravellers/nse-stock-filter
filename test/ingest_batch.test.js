import test from 'node:test';
import assert from 'node:assert/strict';
import {processIngestBody} from '../api/ingest.js';

test('processIngestBody processes multiple symbol candles in one batch',async()=>{
  const calls=[];
  const processor=async(state,symbol,candle,options)=>{
    calls.push({symbol,candle,options});
    return {state:{...state,[symbol]:candle.time},events:[{type:'ELIGIBLE',id:symbol}]};
  };
  const body={candlesBySymbol:{AAA:{time:'2026-09-04T10:00:00+05:30',close:100},BBB:{time:'2026-09-04T10:00:00+05:30',close:200}},seed:false};
  const result=await processIngestBody({},body,processor);
  assert.equal(calls.length,2);
  assert.deepEqual(calls.map(x=>x.symbol),['AAA','BBB']);
  assert.equal(result.state.AAA,'2026-09-04T10:00:00+05:30');
  assert.equal(result.state.BBB,'2026-09-04T10:00:00+05:30');
  assert.deepEqual(result.events,[{type:'ELIGIBLE',id:'AAA'},{type:'ELIGIBLE',id:'BBB'}]);
});

test('processIngestBody keeps legacy single-symbol payload support',async()=>{
  const calls=[];
  const processor=async(state,symbol,candle,options)=>{calls.push({symbol,candle,options});return{state,events:[]}};
  const body={symbol:'AAA',candles:[{time:'2026-09-04T10:00:00+05:30',close:100}],seed:true};
  await processIngestBody({},body,processor);
  assert.equal(calls.length,1);
  assert.equal(calls[0].symbol,'AAA');
  assert.equal(calls[0].options.seed,true);
});

test('processIngestBody rejects empty batch',async()=>{
  await assert.rejects(()=>processIngestBody({}, {candlesBySymbol:{}}, async()=>({state:{},events:[]})),/symbol and candle\(s\) required/);
});
