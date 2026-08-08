const { sign } = require('../lib/game');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Método não permitido' });
  const password = req.body?.password || '';
  const expected = process.env.ADMIN_PASSWORD || 'CAOS-2026';
  if (password !== expected) return res.status(401).json({ error:'Senha incorreta.' });
  const token = sign({ admin:true, exp:Date.now() + 1000 * 60 * 60 * 12 });
  res.setHeader('Set-Cookie', `admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  return res.status(200).json({ ok:true });
};
