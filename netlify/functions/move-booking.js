const { getCollection, localToUTC, localDateStr, localTimeStr, CORS, ok, err } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const { booking_id, new_slot_start_local, new_slot_end_local } = JSON.parse(event.body || '{}');
    if (!booking_id || !new_slot_start_local || !new_slot_end_local) return err(400, 'Champs obligatoires manquants');

    const col = await getCollection();
    const result = await col.updateOne({ id: booking_id }, {
      $set: {
        slot_start_utc: localToUTC(new_slot_start_local).toISOString(),
        slot_end_utc: localToUTC(new_slot_end_local).toISOString(),
        date: localDateStr(new_slot_start_local),
        time: localTimeStr(new_slot_start_local)
      }
    });

    if (result.matchedCount === 0) return err(404, 'Réservation introuvable');
    return ok({ success: true });
  } catch (e) {
    console.error(e);
    return err(500, e.message);
  }
};
