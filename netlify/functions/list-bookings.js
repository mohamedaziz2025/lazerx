const { getCollection, CORS, ok, err } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const { center, filter, status } = event.queryStringParameters || {};
    if (!center) return err(400, 'center required');

    const query = { center };

    if (filter === 'pending') {
      query.status = { $ne: 'cancelled' };
      query.$or = [{ attendance: null }, { attendance: { $exists: false } }];
    } else if (status) {
      query.status = status;
    }

    const col = await getCollection();
    const bookings = await col
      .find(query)
      .sort({ date: 1, time: 1 })
      .toArray();

    return ok({ bookings: bookings.map(({ _id, ...b }) => b) });
  } catch (e) {
    console.error(e);
    return err(500, e.message);
  }
};
