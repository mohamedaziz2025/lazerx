const nodemailer = require('nodemailer');
const { CORS, ok, err } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const { to, subject, message } = JSON.parse(event.body || '{}');

    if (!subject || !message) return err(400, 'subject et message requis');
    if (!to || (Array.isArray(to) && to.length === 0)) return err(400, 'destinataire requis');

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_SERVER || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });

    const recipients = Array.isArray(to) ? to.join(', ') : to;

    await transporter.sendMail({
      from: `"LazerX Nabeul" <${process.env.SMTP_USER}>`,
      to: recipients,
      subject,
      html: message,
      text: message.replace(/<[^>]*>/g, '')
    });

    return ok({ success: true, sent: Array.isArray(to) ? to.length : 1 });
  } catch (e) {
    console.error(e);
    return err(500, e.message);
  }
};
