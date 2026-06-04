import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'hanxing_image.db');

export const db: BetterSqlite3.Database = new BetterSqlite3(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const JSON_FIELDS = new Set(['result_images', 'supported_sizes', 'allowed_models', 'managed_models', 'retry_errors', 'reference_images']);

function parseJsonFields(row: any): any {
  if (!row || typeof row !== 'object') return row;
  const out: any = {};
  for (const key of Object.keys(row)) {
    const val = row[key];
    if (JSON_FIELDS.has(key) && typeof val === 'string') {
      try { out[key] = JSON.parse(val); } catch { out[key] = val; }
    } else {
      out[key] = val;
    }
  }
  return out;
}

function normalizeParams(params?: unknown[]): unknown[] {
  if (!params) return [];
  return params.map((value) => {
    if (value && typeof value === 'object') {
      return JSON.stringify(value);
    }
    return value;
  });
}

export function query(sql: string, params?: unknown[]): { rows: any[]; rowCount: number; lastInsertRowid?: number; changes?: number } {
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA')) {
    const raw = db.prepare(sql).all(...(params ?? []));
    const rows = raw.map(parseJsonFields);
    return { rows, rowCount: rows.length };
  }
  const normalizedParams = normalizeParams(params);
  const result = db.prepare(sql).run(...normalizedParams);
  const res: { rows: any[]; rowCount: number; lastInsertRowid?: number; changes?: number } = {
    rows: [],
    rowCount: result.changes,
    changes: result.changes,
  };
  if (trimmed.startsWith('INSERT')) {
    res.lastInsertRowid = Number(result.lastInsertRowid);
  }
  return res;
}
