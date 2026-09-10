export function requireAthSecret(req) {
  const expected = process.env.ATH_INGEST_SECRET || process.env.INGEST_SECRET;
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  if (!expected || supplied !== expected) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }
}
