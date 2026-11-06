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
  return db;
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
      faja TEXT NOT NULL,
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
  `);
}
