const { getCollection, CORS, ok, err } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const { start, center } = event.queryStringParameters || {};
    if (!start || !center) return err(400, 'start and center required');

    const endDate = new Date(start + 'T00:00:00Z');
    endDate.setDate(endDate.getDate() + 5);
    const endStr = endDate.toISOString().split('T')[0];

    const col = await getCollection();
    const bookings = await col.find({
      center,
      status: 'booked',
      date: { $gte: start, $lte: endStr }
    }).toArray();

    return ok({ bookings: bookings.map(({ _id, ...b }) => b) });
  } catch (e) {
    console.error(e);
    return err(500, e.message);
  }
};
