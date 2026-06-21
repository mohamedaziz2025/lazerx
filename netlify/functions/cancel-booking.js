const { getCollection, CORS, ok, err } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const { id } = JSON.parse(event.body || '{}');
    if (!id) return err(400, 'id required');

    const col = await getCollection();
    const result = await col.updateOne({ id }, { $set: { status: 'cancelled' } });

    if (result.matchedCount === 0) return err(404, 'Réservation introuvable');
    return ok({ success: true });
  } catch (e) {
    console.error(e);
    return err(500, e.message);
  }
};
