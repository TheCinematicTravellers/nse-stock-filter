const KEY = 'ath:state';

const emptyState = () => ({
  stocks: {},
  athMaster: {},
  athEvents: [],
  tradeSetups: [],
  alertLedger: {},
  updatedAt: null,
});

function parseResult(result) {
  if (!result) return emptyState();
  let state = result;
  for (let i = 0; i < 6 && typeof state === 'string'; i += 1) state = JSON.parse(state);
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('ATH state is not an object');
  return state;
}

export async function readAthState() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('KV storage is not configured');
  const response = await fetch(`${url}/get/${encodeURIComponent(KEY)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('KV ATH GET failed');
  return parseResult((await response.json()).result);
}

export async function writeAthState(state) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('KV storage is not configured');
  const response = await fetch(`${url}/set/${encodeURIComponent(KEY)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (!response.ok) throw new Error('KV ATH SET failed');
}
