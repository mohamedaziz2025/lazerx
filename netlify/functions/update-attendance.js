const { getCollection, CORS, ok, err } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const { id, attendance, status, price, notes } = JSON.parse(event.body || '{}');
    if (!id) return err(400, 'id required');

    const updates = {};
    if (attendance !== undefined) updates.attendance = attendance;
    if (status !== undefined) updates.status = status;
    if (price !== undefined) updates.price = price;
    if (notes !== undefined) updates.notes = notes;

    const col = await getCollection();
    const result = await col.updateOne({ id }, { $set: updates });

    if (result.matchedCount === 0) return err(404, 'Séance introuvable');
    return ok({ success: true });
  } catch (e) {
    console.error(e);
    return err(500, e.message);
  }
};
