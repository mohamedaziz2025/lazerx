const { MongoClient } = require('mongodb');

let client;

async function getCollection() {
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
  }
  return client.db('lazerx').collection('bookings');
}

// Africa/Tunis = UTC+1, no DST
const TZ_OFFSET_MS = 60 * 60 * 1000;

function localToUTC(localStr) {
  return new Date(new Date(localStr + 'Z').getTime() - TZ_OFFSET_MS);
}

function localDateStr(localStr) {
  return localStr.split('T')[0];
}

function localTimeStr(localStr) {
  return localStr.split('T')[1].substring(0, 5);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

function ok(body) {
  return { statusCode: 200, headers: CORS, body: JSON.stringify(body) };
}

function err(status, message) {
  return { statusCode: status, headers: CORS, body: JSON.stringify({ error: message }) };
}

module.exports = { getCollection, localToUTC, localDateStr, localTimeStr, CORS, ok, err };
