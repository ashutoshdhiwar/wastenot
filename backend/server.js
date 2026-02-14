const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { items: [] };
  }
}

function writeDB(obj) {
  fs.writeFileSync(DB_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

function generateId() {
  return (
    Date.now().toString(36) +
    Math.floor(Math.random() * 1000).toString(36)
  );
}

const app = express();
app.use(cors());
app.use(express.json());

// --- API ROUTES ---

// Get all items
app.get('/api/items', (req, res) => {
  const db = readDB();
  const sorted = [...db.items].sort((a, b) => b.createdAt - a.createdAt);
  res.json(sorted);
});

// Add item (accepts name, category, storage, expiry, location)
app.post('/api/items', (req, res) => {
  const { name, category, storage, expiry, location } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });

  const db = readDB();
  const item = {
    id: generateId(),
    name,
    category: category || "Other",
    storage: storage || "Pantry",
    expiry: expiry || null,          // ISO date string or null
    location: location || "",        // user-entered address (string)
    createdAt: Date.now()
  };

  db.items.push(item);
  writeDB(db);

  res.status(201).json(item);
});

// Delete item
app.delete('/api/items/:id', (req, res) => {
  const db = readDB();
  const id = req.params.id;

  db.items = db.items.filter(item => item.id !== id);
  writeDB(db);

  res.json({ ok: true });
});

// Serve the frontend
const FRONTEND = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND));

app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
