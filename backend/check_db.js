import Database from 'better-sqlite3';
const db = new Database('data/hanxing_image.db');

console.log('=== Existing Models ===');
const models = db.prepare("SELECT id, name, display_name, api_endpoint FROM models").all();
console.log(JSON.stringify(models, null, 2));

db.close();
