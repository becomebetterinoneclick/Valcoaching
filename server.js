const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const COACH_PASSWORD = 'valorant2024';

// Init data file
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ bookings: [], clients: [] }));
}

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE)); }
  catch { return { bookings: [], clients: [] }; }
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'valcoaching-secret-key',
  resave: false,
  saveUninitialized: false
}));

app.use(express.static('public'));

// ── COACH AUTH ──
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

function requireCoach(req, res, next) {
  if (req.session.coach) return next();
  res.status(401).json({ error: 'Non autorisé' });
}

// ── BOOKINGS ──
app.get('/api/bookings', requireCoach, (req, res) => {
  res.json(readData().bookings);
});

app.post('/api/bookings', (req, res) => {
  const data = readData();
  const booking = { ...req.body, id: Date.now().toString(), status: 'pending' };
  data.bookings.push(booking);
  writeData(data);
  res.json({ success: true, booking });
});

app.patch('/api/bookings/:id', requireCoach, (req, res) => {
  const data = readData();
  const idx = data.bookings.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Non trouvé' });
  data.bookings[idx] = { ...data.bookings[idx], ...req.body };
  writeData(data);
  res.json({ success: true });
});

app.delete('/api/bookings/:id', requireCoach, (req, res) => {
  const data = readData();
  data.bookings = data.bookings.filter(b => b.id !== req.params.id);
  writeData(data);
  res.json({ success: true });
});

// ── CLIENTS ──
app.get('/api/clients', requireCoach, (req, res) => {
  res.json(readData().clients);
});

app.post('/api/clients', (req, res) => {
  const data = readData();
  const exists = data.clients.find(c => c.pseudo === req.body.pseudo);
  if (exists) return res.json({ success: false, error: 'Pseudo déjà utilisé' });
  const client = { ...req.body, id: Date.now().toString() };
  data.clients.push(client);
  writeData(data);
  res.json({ success: true, client });
});

app.post('/api/clients/login', (req, res) => {
  const data = readData();
  const client = data.clients.find(c => c.pseudo === req.body.pseudo && c.pw === req.body.pw);
  if (client) {
    res.json({ success: true, client });
  } else {
    res.json({ success: false });
  }
});

app.delete('/api/clients/:id', requireCoach, (req, res) => {
  const data = readData();
  data.clients = data.clients.filter(c => c.id !== req.params.id);
  writeData(data);
  res.json({ success: true });
});


// ── REVIEWS ──
app.get('/api/reviews', (req, res) => {
  res.json(readData().reviews || []);
});

app.post('/api/reviews', (req, res) => {
  const data = readData();
  if (!data.reviews) data.reviews = [];
  const { clientId, pseudo, rank, rating, text } = req.body;

  // Vérif client existe
  const client = data.clients.find(c => c.id === clientId);
  if (!client) return res.json({ success: false, error: 'Client introuvable.' });

  // Vérif session confirmée
  const hasSession = data.bookings.some(b => b.clientId === clientId && b.status === 'confirmed');
  if (!hasSession) return res.json({ success: false, error: 'Aucune session confirmée.' });

  // Vérif pas déjà posté
  const alreadyPosted = data.reviews.some(r => r.clientId === clientId);
  if (alreadyPosted) return res.json({ success: false, error: 'Avis déjà publié.' });

  // Validation
  if (!rating || rating < 1 || rating > 5) return res.json({ success: false, error: 'Note invalide.' });
  if (!text || text.length < 10 || text.length > 300) return res.json({ success: false, error: 'Texte invalide.' });

  const review = { id: Date.now().toString(), clientId, pseudo, rank, rating: parseInt(rating), text, createdAt: new Date().toISOString() };
  data.reviews.push(review);
  writeData(data);
  res.json({ success: true, review });
});

app.delete('/api/reviews/:id', requireCoach, (req, res) => {
  const data = readData();
  data.reviews = (data.reviews || []).filter(r => r.id !== req.params.id);
  writeData(data);
  res.json({ success: true });
});

// ── COACH SESSION CHECK ──
app.get('/api/coach/check', (req, res) => {
  res.json({ loggedIn: !!req.session.coach });
});

app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
});