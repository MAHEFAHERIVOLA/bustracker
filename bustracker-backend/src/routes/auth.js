const router = require('express').Router();
const bcrypt = require('bcrypt');
const { pool } = require('../db/pool');
const { signToken } = require('../middleware/auth');
const { HttpError } = require('../utils/httpError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Hash factice : on compare toujours un mot de passe, même si l'email n'existe pas (évite de révéler quels emails sont inscrits par le temps de réponse)
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role || 'user' });

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.length > 80) throw new HttpError(400, 'Nom invalide');
  if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Email invalide');
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
    throw new HttpError(400, 'Mot de passe : 6 à 72 caractères');
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role',
      [name.trim(), email.trim(), hash]
    );
    res.status(201).json({ user: publicUser(rows[0]), token: signToken(rows[0]) });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Email déjà utilisé');
    throw e;
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [String(email ?? '').trim()]);
  const user = rows[0];
  const ok = await bcrypt.compare(String(password ?? ''), user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Email ou mot de passe incorrect');
  res.json({ user: publicUser(user), token: signToken(user) });
});

module.exports = router;
