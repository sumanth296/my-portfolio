const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config({ override: true });

const app = express();
const port = process.env.PORT || 3000;
const messagesFile = path.join(__dirname, 'data', 'messages.json');

function saveMessage(messageData) {
  const dir = path.dirname(messagesFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let messages = [];
  if (fs.existsSync(messagesFile)) {
    try {
      messages = JSON.parse(fs.readFileSync(messagesFile, 'utf8'));
    } catch (error) {
      messages = [];
    }
  }

  messages.push({
    ...messageData,
    receivedAt: new Date().toISOString(),
  });

  fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
}

function getMailErrorMessage(error) {
  if (error?.code === 'EAUTH' || error?.responseCode === 535) {
    return 'Message received and saved locally. Email delivery is currently unavailable because Gmail authentication failed.';
  }

  if (error?.code === 'EENVELOPE') {
    return 'Message received and saved locally. The recipient address appears invalid.';
  }

  return 'Message received and saved locally. Email delivery is currently unavailable.';
}

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((err, _req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'The request body could not be parsed. Please try again.',
    });
  }

  console.error('Unhandled server error:', err);
  return res.status(500).json({
    success: false,
    message: 'The server could not process the request. Please try again later.',
  });
});

app.use(express.static(path.join(__dirname)));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Please fill in all fields.' });
    }

    const payload = { name, email, message };
    saveMessage(payload);

    if (!process.env.EMAIL || !process.env.PASSWORD || process.env.EMAIL.includes('your_email') || process.env.PASSWORD.includes('your_')) {
      return res.json({
        success: true,
        savedLocally: true,
        message: 'Message received and saved locally. Email delivery is currently unavailable because mail credentials are not configured.',
      });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL,
      to: process.env.RECIPIENT || process.env.EMAIL,
      subject: `New portfolio message from ${name}`,
      html: `
        <h3>New message from your portfolio</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong><br>${message}</p>
      `,
    });

    return res.json({ success: true, message: 'Message sent successfully.' });
  } catch (error) {
    console.error('Mail sending failed:', error);
    return res.json({
      success: true,
      savedLocally: true,
      message: getMailErrorMessage(error),
    });
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Portfolio backend running on http://localhost:${port}`);
  });
}

module.exports = { app };
