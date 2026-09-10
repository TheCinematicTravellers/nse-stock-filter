import { readAthState } from '../../ath/store.js';

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(await readAthState());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
