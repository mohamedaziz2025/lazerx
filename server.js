const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Route /.netlify/functions/:name → netlify/functions/:name.js
app.all('/.netlify/functions/:name', async (req, res) => {
    try {
        const handler = require(path.join(__dirname, 'netlify/functions', req.params.name));
        const event = {
            httpMethod: req.method,
            queryStringParameters: req.query,
            body: req.method !== 'GET' ? JSON.stringify(req.body) : null,
            headers: req.headers
        };
        const result = await handler.handler(event);
        res.status(result.statusCode)
           .set(result.headers || {})
           .send(result.body);
    } catch (e) {
        console.error('Function error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Fallback SPA — serve index.html for any unknown path
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log('LazerX Nabeul running on http://localhost:' + PORT));
