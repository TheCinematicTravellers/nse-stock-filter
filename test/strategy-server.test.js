import test from 'node:test';
import assert from 'node:assert/strict';
import {msg} from '../api/strategy-server.js';

test('ELIGIBLE message shows compact mother candle time and short icon',()=>{
 const t={symbol:'IEX',side:'SHORT',motherTime:'2026-09-04T14:00:00+05:30',motherHigh:120,motherLow:119.5,entry:119.5,target:119,sl:120};
 const text=msg('ELIGIBLE',t);
 assert.match(text,/Stock: IEX 🔻/);
 assert.match(text,/Mother Candle: 14:00/);
 assert.doesNotMatch(text,/2026-09-04T14:00:00\+05:30/);
});

test('ELIGIBLE message shows compact mother candle time and long icon',()=>{
 const t={symbol:'GAIL',side:'LONG',motherTime:'2026-09-04T14:05:00+05:30',motherHigh:173.1,motherLow:172.8,entry:173.1,target:173.4,sl:172.8};
 const text=msg('ELIGIBLE',t);
 assert.match(text,/Stock: GAIL ⬆️/);
 assert.match(text,/Mother Candle: 14:05/);
});

test('ACTIVE message shows compact breakout candle time and side icon',()=>{
 const t={symbol:'IEX',side:'SHORT',entry:119.5,target:119,sl:120,activatedAt:'2026-09-04T14:10:00+05:30'};
 const text=msg('ACTIVE',t);
 assert.match(text,/IEX 🔻 SHORT/);
 assert.match(text,/Breakout Candle: 14:10/);
});
