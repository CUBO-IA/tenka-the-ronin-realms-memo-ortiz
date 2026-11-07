import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function abrirDb(ruta = process.env.RUTA_DB || path.join(RAIZ, 'tenka.db')) {
  if (ruta !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(ruta)), { recursive: true });
  }

  const db = new Database(ruta);
  db.pragma('foreign_keys = ON');
  if (ruta !== ':memory:') db.pragma('journal_mode = WAL');

  crearEsquema(db);
  migrar(db);
  return db;
}

// Bases creadas antes de que el hakama reemplazara a la faja.
function migrar(db) {
  const columnas = db.prepare('PRAGMA table_info(ronin)').all().map((columna) => columna.name);
  if (columnas.includes('faja') && !columnas.includes('hakama')) {
    db.exec("ALTER TABLE ronin RENAME COLUMN faja TO hakama");
    db.exec("UPDATE ronin SET hakama = 'negro'");
  }

  // Bandeja del celular: los mensajes guardan si el maestro ya los leyó.
  const columnasMensajes = db.prepare('PRAGMA table_info(mensajes)').all().map((columna) => columna.name);
  if (columnasMensajes.length && !columnasMensajes.includes('leido')) {
    db.exec('ALTER TABLE mensajes ADD COLUMN leido INTEGER NOT NULL DEFAULT 0');
  }
  // La conversación guarda también lo que dice el maestro.
  if (columnasMensajes.length && !columnasMensajes.includes('de')) {
    db.exec("ALTER TABLE mensajes ADD COLUMN de TEXT NOT NULL DEFAULT 'ronin'");
  }
}

function crearEsquema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      nombre_normalizado TEXT NOT NULL UNIQUE,
      pin_hash TEXT NOT NULL,
      creado INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sesiones (
      id TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL CHECK (tipo IN ('computadora', 'movil')),
      creada INTEGER NOT NULL,
      vence INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sesiones_por_usuario
      ON sesiones(usuario_id);

    CREATE TABLE IF NOT EXISTS emparejamientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      creado INTEGER NOT NULL,
      vence INTEGER NOT NULL,
      usado INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS emparejamientos_por_usuario
      ON emparejamientos(usuario_id, usado);

    CREATE TABLE IF NOT EXISTS ronin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
      nombre TEXT NOT NULL,
      bando TEXT NOT NULL CHECK (bando IN ('luz', 'sombra')),
      kimono TEXT NOT NULL,
      hakama TEXT NOT NULL,
      tocado TEXT NOT NULL,
      kamon TEXT NOT NULL,
      territorio TEXT,
      era INTEGER NOT NULL DEFAULT 1,
      estado TEXT NOT NULL DEFAULT 'despierto',
      tarea TEXT,
      tarea_fin INTEGER,
      escudo_hasta INTEGER,
      creado INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recursos (
      ronin_id INTEGER NOT NULL REFERENCES ronin(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      cantidad INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (ronin_id, tipo)
    );

    CREATE TABLE IF NOT EXISTS edificios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ronin_id INTEGER NOT NULL REFERENCES ronin(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      etapa TEXT NOT NULL CHECK (etapa IN ('cimientos', 'construccion', 'terminado')),
      progreso INTEGER NOT NULL DEFAULT 0,
      creado INTEGER NOT NULL,
      actualizado INTEGER NOT NULL,
      UNIQUE(ronin_id, tipo)
    );

    CREATE INDEX IF NOT EXISTS edificios_por_ronin
      ON edificios(ronin_id);

    CREATE TABLE IF NOT EXISTS mensajes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ronin_id INTEGER NOT NULL REFERENCES ronin(id) ON DELETE CASCADE,
      texto TEXT NOT NULL,
      opciones_json TEXT NOT NULL,
      creado INTEGER NOT NULL,
      respondido INTEGER NOT NULL DEFAULT 0,
      respuesta TEXT,
      leido INTEGER NOT NULL DEFAULT 0,
      de TEXT NOT NULL DEFAULT 'ronin'
    );

    CREATE TABLE IF NOT EXISTS suscripciones_push (
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      llaves_json TEXT NOT NULL,
      creado INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tropas (
      ronin_id INTEGER NOT NULL REFERENCES ronin(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      cantidad INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (ronin_id, tipo)
    );

    CREATE TABLE IF NOT EXISTS alianzas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clan_a INTEGER NOT NULL REFERENCES ronin(id) ON DELETE CASCADE,
      clan_b INTEGER NOT NULL REFERENCES ronin(id) ON DELETE CASCADE,
      estado TEXT NOT NULL CHECK (estado IN ('propuesta', 'activa', 'rechazada', 'rota')),
      creada INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS batallas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      atacante INTEGER NOT NULL REFERENCES ronin(id) ON DELETE CASCADE,
      defensor INTEGER NOT NULL REFERENCES ronin(id) ON DELETE CASCADE,
      ataque REAL NOT NULL,
      defensa REAL NOT NULL,
      resultado TEXT NOT NULL,
      botin_json TEXT NOT NULL,
      hora INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS config (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS mensajes_por_ronin
      ON mensajes(ronin_id, respondido);
  `);
}
