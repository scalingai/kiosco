import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'kiosco.db');
const db = new Database(dbPath);

// WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS proveedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS compras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
    categoria TEXT NOT NULL CHECK (categoria IN ('cigarrillos', 'varios')),
    importe REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    categoria TEXT NOT NULL CHECK (categoria IN ('cigarrillos', 'varios')),
    importe REAL NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_compras_fecha ON compras(fecha);
  CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
`);

const app = express();
app.use(cors());
app.use(express.json());

// --- PROVEEDORES ---
app.get('/api/proveedores', (req, res) => {
  const rows = db.prepare('SELECT * FROM proveedores ORDER BY nombre').all();
  res.json(rows);
});

app.post('/api/proveedores', (req, res) => {
  const nombre = req.body.nombre.toUpperCase();
  const stmt = db.prepare('INSERT INTO proveedores (nombre) VALUES (?) ON CONFLICT (nombre) DO UPDATE SET nombre=? RETURNING *');
  const row = stmt.get(nombre, nombre);
  res.json(row);
});

// --- COMPRAS ---
app.get('/api/compras', (req, res) => {
  const { mes, anio } = req.query;
  const startDate = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const endMonth = Number(mes) === 12 ? `${Number(anio) + 1}-01-01` : `${anio}-${String(Number(mes) + 1).padStart(2, '0')}-01`;
  const rows = db.prepare(`
    SELECT c.*, p.nombre as proveedor_nombre
    FROM compras c JOIN proveedores p ON c.proveedor_id = p.id
    WHERE c.fecha >= ? AND c.fecha < ?
    ORDER BY c.fecha, p.nombre
  `).all(startDate, endMonth);
  res.json(rows);
});

app.post('/api/compras', (req, res) => {
  const { fecha, proveedor_nombre, categoria, importe } = req.body;
  const nombre = proveedor_nombre.toUpperCase();
  db.prepare('INSERT OR IGNORE INTO proveedores (nombre) VALUES (?)').run(nombre);
  const prov = db.prepare('SELECT id FROM proveedores WHERE nombre = ?').get(nombre);
  const result = db.prepare('INSERT INTO compras (fecha, proveedor_id, categoria, importe) VALUES (?, ?, ?, ?)').run(fecha, prov.id, categoria, importe);
  res.json({ id: result.lastInsertRowid, fecha, proveedor_id: prov.id, categoria, importe, proveedor_nombre: nombre });
});

app.delete('/api/compras/:id', (req, res) => {
  db.prepare('DELETE FROM compras WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- VENTAS ---
app.get('/api/ventas', (req, res) => {
  const { mes, anio } = req.query;
  const startDate = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const endMonth = Number(mes) === 12 ? `${Number(anio) + 1}-01-01` : `${anio}-${String(Number(mes) + 1).padStart(2, '0')}-01`;
  const rows = db.prepare('SELECT * FROM ventas WHERE fecha >= ? AND fecha < ? ORDER BY fecha').all(startDate, endMonth);
  res.json(rows);
});

app.post('/api/ventas', (req, res) => {
  const { fecha, categoria, importe } = req.body;
  const result = db.prepare('INSERT INTO ventas (fecha, categoria, importe) VALUES (?, ?, ?)').run(fecha, categoria, importe);
  res.json({ id: result.lastInsertRowid, fecha, categoria, importe });
});

app.delete('/api/ventas/:id', (req, res) => {
  db.prepare('DELETE FROM ventas WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- PROVEEDORES: historial y stats ---
app.get('/api/proveedores/stats', (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.nombre,
      COUNT(c.id) as total_compras,
      COALESCE(SUM(c.importe), 0) as total_importe,
      MAX(c.fecha) as ultima_compra
    FROM proveedores p
    LEFT JOIN compras c ON c.proveedor_id = p.id
    GROUP BY p.id, p.nombre
    ORDER BY total_importe DESC
  `).all();
  res.json(rows);
});

app.get('/api/proveedores/:id/historial', (req, res) => {
  const { id } = req.params;
  const prov = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(id);
  if (!prov) return res.status(404).json({ error: 'No encontrado' });

  const compras = db.prepare(`
    SELECT c.*,
      substr(c.fecha, 1, 7) as mes_anio
    FROM compras c
    WHERE c.proveedor_id = ?
    ORDER BY c.fecha DESC
  `).all(id);

  const porMes = db.prepare(`
    SELECT substr(fecha, 1, 7) as periodo, categoria,
      COUNT(*) as cantidad, SUM(importe) as total
    FROM compras WHERE proveedor_id = ?
    GROUP BY periodo, categoria
    ORDER BY periodo DESC
  `).all(id);

  res.json({ proveedor: prov, compras, porMes });
});

app.put('/api/proveedores/:id', (req, res) => {
  const { nombre } = req.body;
  db.prepare('UPDATE proveedores SET nombre = ? WHERE id = ?').run(nombre.toUpperCase(), req.params.id);
  const row = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(req.params.id);
  res.json(row);
});

app.delete('/api/proveedores/:id', (req, res) => {
  const compras = db.prepare('SELECT COUNT(*) as c FROM compras WHERE proveedor_id = ?').get(req.params.id);
  if (compras.c > 0) return res.status(400).json({ error: 'Tiene compras asociadas' });
  db.prepare('DELETE FROM proveedores WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- RESUMEN MENSUAL ---
app.get('/api/resumen', (req, res) => {
  const { mes, anio } = req.query;
  const startDate = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const endMonth = Number(mes) === 12 ? `${Number(anio) + 1}-01-01` : `${anio}-${String(Number(mes) + 1).padStart(2, '0')}-01`;

  const compras = db.prepare(`
    SELECT categoria, COALESCE(SUM(importe), 0) as total
    FROM compras WHERE fecha >= ? AND fecha < ? GROUP BY categoria
  `).all(startDate, endMonth);

  const ventas = db.prepare(`
    SELECT categoria, COALESCE(SUM(importe), 0) as total
    FROM ventas WHERE fecha >= ? AND fecha < ? GROUP BY categoria
  `).all(startDate, endMonth);

  const diasRow = db.prepare(`
    SELECT COUNT(DISTINCT fecha) as dias
    FROM ventas WHERE fecha >= ? AND fecha < ?
  `).get(startDate, endMonth);

  const toMap = (rows) => {
    const m = { cigarrillos: 0, varios: 0 };
    rows.forEach(r => { m[r.categoria] = r.total; });
    return m;
  };

  const c = toMap(compras);
  const v = toMap(ventas);
  const dias = diasRow.dias || 1;

  res.json({
    compras: { cigarrillos: c.cigarrillos, varios: c.varios, total: c.cigarrillos + c.varios },
    ventas: { cigarrillos: v.cigarrillos, varios: v.varios, total: v.cigarrillos + v.varios },
    ganancia: {
      cigarrillos: v.cigarrillos - c.cigarrillos,
      varios: v.varios - c.varios,
      total: (v.cigarrillos + v.varios) - (c.cigarrillos + c.varios),
    },
    promedioDiario: {
      cigarrillos: Math.round(v.cigarrillos / dias),
      varios: Math.round(v.varios / dias),
      total: Math.round((v.cigarrillos + v.varios) / dias),
    },
    diasConVenta: dias,
  });
});

// --- RESUMEN ANUAL ---
app.get('/api/resumen-anual', (req, res) => {
  const { anio } = req.query;
  const result = [];
  for (let mes = 1; mes <= 12; mes++) {
    const startDate = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const endMonth = mes === 12 ? `${Number(anio) + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, '0')}-01`;

    const compras = db.prepare(`
      SELECT categoria, COALESCE(SUM(importe), 0) as total
      FROM compras WHERE fecha >= ? AND fecha < ? GROUP BY categoria
    `).all(startDate, endMonth);

    const ventas = db.prepare(`
      SELECT categoria, COALESCE(SUM(importe), 0) as total
      FROM ventas WHERE fecha >= ? AND fecha < ? GROUP BY categoria
    `).all(startDate, endMonth);

    const toMap = (rows) => {
      const m = { cigarrillos: 0, varios: 0 };
      rows.forEach(r => { m[r.categoria] = r.total; });
      return m;
    };
    const c = toMap(compras);
    const v = toMap(ventas);
    result.push({
      mes,
      compras: { cigarrillos: c.cigarrillos, varios: c.varios, total: c.cigarrillos + c.varios },
      ventas: { cigarrillos: v.cigarrillos, varios: v.varios, total: v.cigarrillos + v.varios },
      ganancia: {
        cigarrillos: v.cigarrillos - c.cigarrillos,
        varios: v.varios - c.varios,
        total: (v.cigarrillos + v.varios) - (c.cigarrillos + c.varios),
      },
    });
  }
  const totales = result.reduce((acc, m) => ({
    cigarrillos: acc.cigarrillos + m.ganancia.cigarrillos,
    varios: acc.varios + m.ganancia.varios,
    total: acc.total + m.ganancia.total,
  }), { cigarrillos: 0, varios: 0, total: 0 });

  res.json({ meses: result, resumen: totales });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`API corriendo en http://localhost:${PORT} | BDD: ${dbPath}`));
