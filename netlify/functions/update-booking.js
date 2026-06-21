const { getCollection, CORS, ok, err } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const { booking_id, client_name, phone, category, notes, session_duration, session_type } = JSON.parse(event.body || '{}');
    if (!booking_id) return err(400, 'booking_id required');

    const col = await getCollection();
    const result = await col.updateOne({ id: booking_id }, {
      $set: {
        client_name: client_name?.trim(),
        phone: phone?.trim(),
        category,
        notes: notes?.trim() || '',
        session_duration,
        session_type
      }
    });

    if (result.matchedCount === 0) return err(404, 'Réservation introuvable');
    return ok({ success: true });
  } catch (e) {
    console.error(e);
    return err(500, e.message);
  }
};
