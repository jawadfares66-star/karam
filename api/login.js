import { issueToken } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'ADMIN_PASSWORD not set on server' });
  if (!process.env.JWT_SECRET) return res.status(500).json({ error: 'JWT_SECRET not set on server' });

  const { password } = req.body || {};
  if (typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ error: 'Password required' });
  }
  // tiny artificial delay to slow guessing
  await new Promise(r => setTimeout(r, 200));

  if (password !== expected) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  try {
    const token = issueToken();
    return res.status(200).json({ token });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
