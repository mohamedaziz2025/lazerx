const { getCollection, CORS, ok, err } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

  try {
    const { center, confirm } = JSON.parse(event.body || '{}');
    if (!center) return err(400, 'center required');
    if (confirm !== 'RESET') return err(400, 'Confirmation RESET requise');

    const col = await getCollection();
    const result = await col.deleteMany({ center });
    return ok({ deleted: result.deletedCount, message: `${result.deletedCount} rendez-vous supprimés` });
  } catch (e) {
    console.error(e);
    return err(500, e.message);
  }
};
