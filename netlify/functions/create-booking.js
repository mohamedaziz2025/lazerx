const { getCollection, localToUTC, localDateStr, localTimeStr, CORS, ok, err } = require('./lib/db');
const { randomUUID } = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      client_name, phone, category, notes = '', session_duration = 60,
      session_type = 'solo', slot_start_local, slot_end_local, center, force_create = false
    } = body;

    if (!client_name || !phone || !category || !slot_start_local || !center) {
      return err(400, 'Champs obligatoires manquants');
    }

    const col = await getCollection();

    if (!force_create) {
      const existing = await col.findOne({
        center,
        status: 'booked',
        $or: [
          { phone: phone.trim() },
          { client_name: { $regex: new RegExp('^' + client_name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } }
        ]
      });

      if (existing) {
        const matchBy = existing.phone === phone.trim() ? 'phone' : 'name';
        return {
          statusCode: 409,
          headers: CORS,
          body: JSON.stringify({ conflict: 'duplicate_client', existing_booking: existing, match_by: matchBy })
        };
      }
    }

    const slotStartUTC = localToUTC(slot_start_local);
    const slotEndUTC = localToUTC(slot_end_local);

    const booking = {
      id: randomUUID(),
      center,
      client_name: client_name.trim(),
      phone: phone.trim(),
      category,
      notes: notes.trim(),
      session_duration,
      session_type,
      slot_start_utc: slotStartUTC.toISOString(),
      slot_end_utc: slotEndUTC.toISOString(),
      date: localDateStr(slot_start_local),
      time: localTimeStr(slot_start_local),
      status: 'booked',
      attendance: null,
      price: null,
      created_at: new Date().toISOString()
    };

    await col.insertOne(booking);
    return ok({ success: true, booking });
  } catch (e) {
    console.error(e);
    return err(500, e.message);
  }
};
