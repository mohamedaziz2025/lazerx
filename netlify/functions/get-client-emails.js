const { getCollection, CORS, ok, err } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const center = event.queryStringParameters && event.queryStringParameters.center;
    if (!center) return err(400, 'center requis');

    const col = await getCollection();
    const clients = await col.find(
      { center, email: { $exists: true, $ne: null, $ne: '' } },
      { projection: { client_name: 1, email: 1, _id: 0 } }
    ).toArray();

    const seen = new Set();
    const unique = clients.filter(c => {
      if (!c.email || seen.has(c.email.toLowerCase())) return false;
      seen.add(c.email.toLowerCase());
      return true;
    });

    return ok({ emails: unique, count: unique.length });
  } catch (e) {
    console.error(e);
    return err(500, e.message);
  }
};
