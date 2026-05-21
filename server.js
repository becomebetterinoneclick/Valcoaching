const express = require('express');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const COACH_PASSWORD = 'valorant2024';

const pool = new Pool({
  connectionString: 'postgresql://postgres.mjzbkwrbjybiszjcixbs:A72-.s39339ckK.!X@aws-1-eu-central-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      client_id TEXT,
      pseudo TEXT,
      rank TEXT,
      discord TEXT,
      agents JSONB,
      date TEXT,
      time TEXT,
      duration INTEGER,
      note TEXT,
      status TEXT DEFAULT 'pending',
      retour TEXT,
      created_at TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      pseudo TEXT UNIQUE,
      discord TEXT,
      rank TEXT,
      pw TEXT,
      agents JSONB,
      avatar TEXT,
      created_at TEXT
    )
  `);
  console.log('Base de donnees prete !');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'avatar_' + Date.now() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg','image/png','image/gif','image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Image uniquement'));
    }
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'valcoaching-secret-key',
  resave: false,
  saveUninitialized: false
}));
app.use(express.static('public'));

function requireCoach(req, res, next) {
  if (req.session.coach) return next();
  res.status(401).json({ error: 'Non autorise' });
}

app.post('/api/coach/login', (req, res) => {
  if (req.body.password === COACH_PASSWORD) {
    req.session.coach = true;
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

app.post('/api/coach/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/coach/check', (req, res) => {
  res.json({ loggedIn: !!req.session.coach });
});

app.get('/api/bookings', requireCoach, async (req, res) => {
  const result = await pool.query('SELECT * FROM bookings ORDER BY created_at DESC');
  res.json(result.rows.map(b => ({ ...b, id: b.id.toString(), clientId: b.client_id })));
});

app.post('/api/bookings', async (req, res) => {
  const { clientId, pseudo, rank, discord, agents, date, time, duration, note } = req.body;
  const result = await pool.query(
    `INSERT INTO bookings (client_id, pseudo, rank, discord, agents, date, time, duration, note, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10) RETURNING *`,
    [clientId, pseudo, rank, discord, JSON.stringify(agents), date, time, duration, note, new Date().toISOString()]
  );
  const b = result.rows[0];
  res.json({ success: true, booking: { ...b, id: b.id.toString(), clientId: b.client_id } });
});

app.patch('/api/bookings/:id', requireCoach, async (req, res) => {
  const { status, retour } = req.body;
  await pool.query('UPDATE bookings SET status=$1, retour=$2 WHERE id=$3', [status, retour, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/bookings/:id', requireCoach, async (req, res) => {
  await pool.query('DELETE FROM bookings WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/clients', requireCoach, async (req, res) => {
  const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
  res.json(result.rows.map(c => ({ ...c, id: c.id.toString() })));
});

app.post('/api/clients', async (req, res) => {
  const { pseudo, discord, rank, pw, agents } = req.body;
  const exists = await pool.query('SELECT id FROM clients WHERE LOWER(pseudo)=LOWER($1)', [pseudo]);
  if (exists.rows.length > 0) return res.json({ success: false, error: 'Pseudo deja utilise' });
  const result = await pool.query(
    `INSERT INTO clients (pseudo, discord, rank, pw, agents, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [pseudo, discord, rank, pw, JSON.stringify(agents), new Date().toISOString()]
  );
  const c = result.rows[0];
  res.json({ success: true, client: { ...c, id: c.id.toString() } });
});

app.post('/api/clients/login', async (req, res) => {
  const { pseudo, pw } = req.body;
  const result = await pool.query('SELECT * FROM clients WHERE LOWER(pseudo)=LOWER($1) AND pw=$2', [pseudo, pw]);
  if (result.rows.length > 0) {
    const c = result.rows[0];
    res.json({ success: true, client: { ...c, id: c.id.toString() } });
  } else {
    res.json({ success: false });
  }
});

app.delete('/api/clients/:id', requireCoach, async (req, res) => {
  await pool.query('DELETE FROM clients WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/clients/:id/avatar', upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Pas de fichier' });
  const avatar = '/uploads/' + req.file.filename;
  await pool.query('UPDATE clients SET avatar=$1 WHERE id=$2', [avatar, req.params.id]);
  res.json({ success: true, avatar });
});

app.get('/api/mybookings/:clientId', async (req, res) => {
  const result = await pool.query('SELECT * FROM bookings WHERE client_id=$1 ORDER BY date DESC', [req.params.clientId]);
  res.json(result.rows.map(b => ({ ...b, id: b.id.toString(), clientId: b.client_id })));
});

initDB().then(() => {
  app.listen(PORT, () => console.log('Serveur lance sur le port ' + PORT));
}).catch(err => {
  console.error('Erreur DB:', err);
});
