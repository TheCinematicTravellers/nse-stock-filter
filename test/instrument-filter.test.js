import test from 'node:test';
import assert from 'node:assert/strict';
import {FILTERED_SYMBOLS,filter_instruments} from '../runner/instrument_filter.js';

const EXPECTED = new Set([
 'ADANIENT','ADANIPORTS','APOLLOHOSP','ASIANPAINT','AXISBANK','BAJAJ-AUTO','BAJFINANCE','BAJAJFINSV',
 'BEL','BHARTIARTL','CIPLA','COALINDIA','DRREDDY','EICHERMOT','ETERNAL','GRASIM','HCLTECH','HDFCBANK',
 'HDFCLIFE','HINDALCO','HINDUNILVR','ICICIBANK','ITC','INFY','INDIGO','JSWSTEEL','JIOFIN','KOTAKBANK',
 'LT','M&M','MARUTI','MAXHEALTH','NTPC','NESTLEIND','ONGC','POWERGRID','RELIANCE','SBILIFE','SHRIRAMFIN',
 'SBIN','SUNPHARMA','TCS','TATACONSUM','TMPV','TATASTEEL','TECHM','TITAN','TRENT','ULTRACEMCO','WIPRO'
]);

test('Inside-50-EMA universe contains exactly the locked 50 stocks',()=>{
 assert.deepEqual(FILTERED_SYMBOLS,EXPECTED);
 assert.equal(FILTERED_SYMBOLS.size,50);
});

test('instrument filter excludes every stock outside the locked 50',()=>{
 const instruments=[...EXPECTED,'RELIANCE','BSE','CGPOWER','XYZ'].map((symbol,i)=>({symbol,token:String(i+1)}));
 const filtered=filter_instruments(instruments);
 assert.deepEqual(new Set(filtered.map(x=>x.symbol)),EXPECTED);
});
