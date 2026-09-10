import { requireAthSecret } from './auth.js';
import { readAthState, writeAthState } from '../../ath/store.js';
import { seedAthBaseline } from '../../ath/baseline.js';

export default async function handler(req, res) {
  try {
    requireAthSecret(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { rows, updatedAt } = req.body || {};
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be an array' });
    const result = seedAthBaseline(await readAthState(), rows, updatedAt || new Date().toISOString());
    await writeAthState(result.state);
    return res.status(200).json({ initialized: result.initialized, updatedAt: result.state.updatedAt });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
}
