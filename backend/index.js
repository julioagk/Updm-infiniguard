import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import Database from 'better-sqlite3';

const app = express();
const PORT = process.env.PORT || 4000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- BASE DE DATOS (SQLite) ---
const DB_PATH = 'database.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Inicializar Tablas
const initDB = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      rol TEXT NOT NULL,
      nombre TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS servicios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT,
      cliente TEXT,
      usuario TEXT,
      tecnico TEXT,
      tecnicoId INTEGER,
      tipo TEXT,
      cantidad INTEGER,
      direccion TEXT,
      telefono TEXT,
      descripcion TEXT,
      modelo TEXT,
      pdf TEXT,
      foto TEXT, 
      estado TEXT,
      respuestaCotizacion TEXT,
      precioEstimado TEXT,
      pdfCotizacion TEXT,
      estadoCliente TEXT,
      fecha TEXT,
      fechaServicio TEXT,
      horaServicio TEXT,
      notas TEXT
    )
  `);

  // Migración: Agregar columnas si no existen (para bases de datos existentes)
  try {
    db.exec(`ALTER TABLE servicios ADD COLUMN modelo TEXT`);
  } catch (e) {
    // Columna ya existe
  }
  try {
    db.exec(`ALTER TABLE servicios ADD COLUMN pdfCotizacion TEXT`);
  } catch (e) {
    // Columna ya existe
  }
  try {
    db.exec(`ALTER TABLE servicios ADD COLUMN tecnicoId INTEGER`);
  } catch (e) {
    // Columna ya existe
  }
  try {
    db.exec(`ALTER TABLE servicios ADD COLUMN fechaServicio TEXT`);
  } catch (e) {
    // Columna ya existe
  }
  try {
    db.exec(`ALTER TABLE servicios ADD COLUMN horaServicio TEXT`);
  } catch (e) {
    // Columna ya existe
  }
  try {
    db.exec(`ALTER TABLE servicios ADD COLUMN notas TEXT`);
  } catch (e) {
    // Columna ya existe
  }

  // Nuevas columnas para información del técnico
  try {
    db.exec(`ALTER TABLE servicios ADD COLUMN tecnicoAsignado TEXT`);
  } catch (e) {
    // Columna ya existe
  }
  try {
    db.exec(`ALTER TABLE servicios ADD COLUMN telefonoTecnico TEXT`);
  } catch (e) {
    // Columna ya existe
  }
  try {
    db.exec(`ALTER TABLE servicios ADD COLUMN fechaProgramada TEXT`);
  } catch (e) {
    // Columna ya existe
  }

  // Migrar datos existentes de 'tecnico' a 'tecnicoAsignado'
  try {
    db.exec(`
      UPDATE servicios 
      SET tecnicoAsignado = tecnico 
      WHERE tecnico IS NOT NULL AND tecnicoAsignado IS NULL
    `);
  } catch (e) {
    console.log('Error migrando datos de técnico:', e.message);
  }

  const stmt = db.prepare('SELECT count(*) as count FROM usuarios');
  if (stmt.get().count === 0) {
    const insert = db.prepare('INSERT INTO usuarios (email, password, rol, nombre) VALUES (?, ?, ?, ?)');
    insert.run('administrador@infiniguard.com', '123', 'admin', 'Administrador');
  }
};
initDB();

// --- CONFIGURACIÓN DE ARCHIVOS ---
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, Date.now() + '-' + cleanName);
  }
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// --- RUTAS ---

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND password = ?').get(email, password);
  if (user) res.json({ success: true, user });
  else res.status(401).json({ success: false, message: 'Error de credenciales' });
});

// GET todos los usuarios
app.get('/api/usuarios', (req, res) => {
  const usuarios = db.prepare('SELECT * FROM usuarios').all();
  res.json(usuarios);
});

// GET solo técnicos
app.get('/api/tecnicos', (req, res) => {
  const tecnicos = db.prepare('SELECT * FROM usuarios WHERE rol = ?').all('tecnico');
  res.json(tecnicos);
});

app.get('/api/servicios', (req, res) => {
  const servicios = db.prepare('SELECT * FROM servicios ORDER BY id DESC').all();
  // Convertimos el string de la foto a un array real para el frontend
  const formateados = servicios.map(s => {
    let fotoArray = [];
    if (s.foto) {
      try {
        fotoArray = JSON.parse(s.foto);
      } catch (e) {
        // Si foto no es JSON válido, intentar usarlo como string directo
        fotoArray = [s.foto];
      }
    }
    return {
      ...s,
      foto: Array.isArray(fotoArray) ? fotoArray[0] : fotoArray
    };
  });
  res.json(formateados);
});

// RUTA CLAVE: Acepta archivos con upload.fields
app.post('/api/servicios', upload.fields([{ name: 'foto', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), (req, res) => {
  const data = req.body;

  // Convertimos archivos a rutas
  let fotoPath = JSON.stringify([]);
  let pdfPath = null;

  if (req.files && req.files['foto']) {
    fotoPath = JSON.stringify([`uploads/${req.files['foto'][0].filename}`]);
  }
  if (req.files && req.files['pdf']) {
    pdfPath = `uploads/${req.files['pdf'][0].filename}`;
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO servicios (
        titulo, cliente, usuario, tecnico, tipo, cantidad, direccion, telefono, 
        descripcion, modelo, pdf, foto, estado, fecha, precioEstimado, respuestaCotizacion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      data.titulo, data.cliente || null, data.usuario || 'Anónimo', data.tecnico || null,
      data.tipo, data.cantidad || 1, data.direccion || '', data.telefono || '',
      data.descripcion || '', data.modelo || '', pdfPath, fotoPath, 'pendiente',
      new Date().toISOString().split('T')[0], null, null
    );

    res.json({ success: true, id: info.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/servicios/:id', upload.single('archivo'), (req, res) => {
  const { id } = req.params;
  const update = req.body;

  try {
    // Si viene archivo (PDF de cotización del admin)
    if (req.file) {
      const pdfPath = `uploads/${req.file.filename}`;
      db.prepare('UPDATE servicios SET pdfCotizacion = ? WHERE id = ?').run(pdfPath, id);
    }

    // Actualizar estado
    if (update.estado) {
      db.prepare('UPDATE servicios SET estado = ? WHERE id = ?').run(update.estado, id);
    }

    // Actualizar estado del cliente (cuando acepta/rechaza)
    if (update.estadoCliente) {
      db.prepare('UPDATE servicios SET estadoCliente = ? WHERE id = ?').run(update.estadoCliente, id);
    }

    // Actualizar precio estimado (cuando el admin cotiza)
    if (update.precio || update.precioEstimado) {
      const precio = update.precio || update.precioEstimado;
      db.prepare('UPDATE servicios SET precioEstimado = ? WHERE id = ?').run(precio, id);
    }

    // Actualizar respuesta/notas del admin
    if (update.respuestaAdmin || update.respuestaCotizacion) {
      const respuesta = update.respuestaAdmin || update.respuestaCotizacion;
      db.prepare('UPDATE servicios SET respuestaCotizacion = ? WHERE id = ?').run(respuesta, id);
    }

    // Actualizar técnico asignado (cuando admin asigna)
    if (update.tecnico) {
      db.prepare('UPDATE servicios SET tecnico = ? WHERE id = ?').run(update.tecnico, id);
    }

    // Nuevos campos de técnico
    if (update.tecnicoAsignado) {
      db.prepare('UPDATE servicios SET tecnicoAsignado = ? WHERE id = ?').run(update.tecnicoAsignado, id);
    }

    if (update.telefonoTecnico) {
      db.prepare('UPDATE servicios SET telefonoTecnico = ? WHERE id = ?').run(update.telefonoTecnico, id);
    }

    if (update.fechaProgramada) {
      db.prepare('UPDATE servicios SET fechaProgramada = ? WHERE id = ?').run(update.fechaProgramada, id);
    }

    if (update.tecnicoId) {
      db.prepare('UPDATE servicios SET tecnicoId = ? WHERE id = ?').run(update.tecnicoId, id);
    }

    if (update.fechaServicio) {
      db.prepare('UPDATE servicios SET fechaServicio = ? WHERE id = ?').run(update.fechaServicio, id);
    }

    if (update.horaServicio) {
      db.prepare('UPDATE servicios SET horaServicio = ? WHERE id = ?').run(update.horaServicio, id);
    }

    if (update.notas) {
      db.prepare('UPDATE servicios SET notas = ? WHERE id = ?').run(update.notas, id);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error en PUT:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Faltan datos' });
  }
  const exists = db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email);
  if (exists) {
    return res.status(409).json({ success: false, message: 'El email ya está registrado' });
  }
  const stmt = db.prepare('INSERT INTO usuarios (email, password, rol, nombre) VALUES (?, ?, ?, ?)');
  const info = stmt.run(email, password, 'cliente', email.split('@')[0]);
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(info.lastInsertRowid);
  res.json({ success: true, user });
});

// POST - Crear un nuevo usuario
app.post('/api/usuarios', (req, res) => {
  const { nombre, email, password, rol } = req.body;
  try {
    const stmt = db.prepare('INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)');
    const info = stmt.run(nombre, email, password, rol);
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (error) {
    console.error('Error creando usuario:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT - Actualizar un usuario existente
app.put('/api/usuarios/:id', (req, res) => {
  const { id } = req.params;
  const { nombre, email, password, rol } = req.body;
  try {
    // Si viene password, actualizarlo, si no, solo actualizar los demás campos
    if (password) {
      db.prepare('UPDATE usuarios SET nombre = ?, email = ?, password = ?, rol = ? WHERE id = ?')
        .run(nombre, email, password, rol, id);
    } else {
      db.prepare('UPDATE usuarios SET nombre = ?, email = ?, rol = ? WHERE id = ?')
        .run(nombre, email, rol, id);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE - Eliminar un usuario
app.delete('/api/usuarios/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST - Reiniciar base de datos (eliminar todos los servicios)
app.post('/api/db/reset', (req, res) => {
  try {
    // Eliminar todos los servicios
    db.prepare('DELETE FROM servicios').run();

    // Reiniciar el autoincrement
    db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run('servicios');

    console.log('✅ Base de datos reiniciada - Todos los servicios eliminados');
    res.json({ success: true, message: 'Base de datos reiniciada correctamente' });
  } catch (error) {
    console.error('Error reiniciando base de datos:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Server en puerto ${PORT}`));