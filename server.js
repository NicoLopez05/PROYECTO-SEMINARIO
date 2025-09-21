// server.js
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const crypto = require("node:crypto");

const PORT = process.env.PORT || 4000;
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// --- DB ---
const db = new Database("patterns.db");
db.pragma("journal_mode = WAL");

// tablas + indices
db.exec(`
CREATE TABLE IF NOT EXISTS patterns (
  id TEXT PRIMARY KEY,
  deviceId TEXT NOT NULL,
  storedName TEXT NOT NULL,   -- p.ej: 1716765123_Mi_patron.json
  originalName TEXT NOT NULL, -- nombre como lo ingresa el usuario
  path TEXT NOT NULL UNIQUE,  -- p.ej: <deviceId>/<storedName>
  createdAt TEXT NOT NULL,    -- ISO string
  data TEXT NOT NULL          -- JSON string
);
CREATE INDEX IF NOT EXISTS idx_patterns_device ON patterns(deviceId);
CREATE INDEX IF NOT EXISTS idx_patterns_created ON patterns(createdAt DESC);
`);

function sanitize(s) {
  return String(s).replace(/[^a-z0-9\-_\.]+/gi, "_");
}

// --- Endpoints ---

// POST /api/patterns/upload
// Acepta: { deviceId, fileName?, name?, json?, data? }
app.post("/api/patterns/upload", (req, res) => {
  try {
    const { deviceId } = req.body;
    const fileName = req.body.fileName ?? req.body.name;
    const payload = req.body.json ?? req.body.data; // objeto ya plano

    if (!deviceId || !fileName || payload == null) {
      return res.status(400).json({ error: "deviceId, fileName/name y json/data son requeridos" });
    }

    const ts = Date.now();
    const storedName = `${ts}_${sanitize(fileName)}.json`;
    const path = `${deviceId}/${storedName}`;
    const row = {
      id: crypto.randomUUID(),
      deviceId,
      storedName,
      originalName: String(fileName),
      path,
      createdAt: new Date().toISOString(),
      data: JSON.stringify(payload),
    };

    db.prepare(`
      INSERT INTO patterns (id, deviceId, storedName, originalName, path, createdAt, data)
      VALUES (@id, @deviceId, @storedName, @originalName, @path, @createdAt, @data)
    `).run(row);

    res.json({ path, storedName, createdAt: row.createdAt });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/patterns/list?deviceId=XYZ
// Responde: { items: [{ name, path, createdAt }, ...] }
app.get("/api/patterns/list", (req, res) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) return res.status(400).json({ error: "deviceId requerido" });

    const rows = db.prepare(`
      SELECT storedName AS name, path, createdAt
      FROM patterns
      WHERE deviceId = ?
      ORDER BY createdAt DESC
    `).all(String(deviceId));

    res.json({ items: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/patterns/download?path=<deviceId>/<storedName>
// Responde: { data: <json> }
app.get("/api/patterns/download", (req, res) => {
  try {
    const { path } = req.query;
    if (!path) return res.status(400).json({ error: "path requerido" });

    const row = db.prepare("SELECT data FROM patterns WHERE path = ?").get(String(path));
    if (!row) return res.status(404).json({ error: "No encontrado" });

    res.json({ data: JSON.parse(row.data) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// Salud
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`SQLite API listening on http://localhost:${PORT}`);
});
