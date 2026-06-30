import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;

if (!SECRET && process.env.NODE_ENV !== 'development') {
  // Don't crash on cold start, just warn loudly. issueToken/verifyToken
  // will throw when called.
  console.warn('[auth] JWT_SECRET is not set — admin auth will fail.');
}

export function issueToken(payload = {}) {
  if (!SECRET) throw new Error('JWT_SECRET not configured');
  return jwt.sign({ ...payload, role: 'admin' }, SECRET, { expiresIn: '7d' });
}

export function verifyToken(token) {
  if (!SECRET) throw new Error('JWT_SECRET not configured');
  try {
    const decoded = jwt.verify(token, SECRET);
    if (decoded.role !== 'admin') return null;
    return decoded;
  } catch { return null; }
}

// Convenience: extract token from Authorization: Bearer <token> header
export function tokenFromReq(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice(7).trim();
}

// Middleware-style guard. Returns { ok:true } or { ok:false, status, error }
export function requireAdmin(req) {
  const token = tokenFromReq(req);
  if (!token) return { ok:false, status:401, error:'Missing token' };
  const decoded = verifyToken(token);
  if (!decoded) return { ok:false, status:401, error:'Invalid or expired token' };
  return { ok:true, user: decoded };
}
