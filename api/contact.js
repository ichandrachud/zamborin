module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const { name, email, subject, message, hp } = body;

  if (hp) return res.status(200).json({ ok: true });

  if (typeof message !== 'string' || message.trim().length < 5) {
    return res.status(400).json({ error: 'Please write a message of at least a few words.' });
  }
  if (message.length > 5000) {
    return res.status(400).json({ error: 'Message is too long (5000 character limit).' });
  }

  const emailLooksValid = typeof email === 'string' && /^\S+@\S+\.\S+$/.test(email);
  const replyTo = emailLooksValid ? email : undefined;

  const safeName = typeof name === 'string' ? name.trim().slice(0, 120) : '';
  const safeSubject = typeof subject === 'string' ? subject.trim().slice(0, 200) : '';
  const safeEmail = emailLooksValid ? email.trim() : '';

  const textBody = [
    `Name:    ${safeName || '(not provided)'}`,
    `Email:   ${safeEmail || '(not provided)'}`,
    `Subject: ${safeSubject || '(not provided)'}`,
    '',
    '----',
    '',
    message.trim(),
  ].join('\n');

  const payload = {
    from: 'Zamborin Contact <noreply@zamborin.com>',
    to: ['then_and_again@hotmail.com'],
    subject: safeSubject ? `[Zamborin] ${safeSubject}` : '[Zamborin] New message',
    text: textBody,
  };
  if (replyTo) payload.reply_to = replyTo;

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY env var is not set');
    return res.status(500).json({ error: 'Server not configured. Please try again later.' });
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error('Resend error:', r.status, errText);
      return res.status(502).json({ error: 'Could not deliver the message right now. Please try again in a few minutes.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact handler error:', err);
    return res.status(500).json({ error: 'Could not deliver the message right now. Please try again in a few minutes.' });
  }
};
