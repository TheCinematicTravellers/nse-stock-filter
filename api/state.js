import {readState} from './store.js';
export default async function handler(req,res){try{res.setHeader('Cache-Control','no-store');res.status(200).json(await readState())}catch(e){res.status(500).json({error:e.message})}}
