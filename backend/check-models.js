import BetterSqlite3 from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data/hanxing_image.db');
const db = new BetterSqlite3(dbPath);

console.log('=== 所有模型 ===');
const allModels = db.prepare('SELECT id, name, display_name, visible_in_product, is_active FROM models').all();
console.table(allModels);

console.log('\n=== Product 页面可用模型 ===');
const productModels = db.prepare('SELECT id, name, display_name, visible_in_product, is_active FROM models WHERE visible_in_product = 1 AND is_active = 1').all();
console.table(productModels);
console.log(`共 ${productModels.length} 个可用模型`);

if (productModels.length === 0 && allModels.length > 0) {
  console.log('\n=== 没有启用 product 的模型，现在启用第一个模型 ===');
  db.prepare('UPDATE models SET visible_in_product = 1 WHERE id = ?').run(allModels[0].id);
  console.log(`✓ 已为模型 ${allModels[0].display_name || allModels[0].name} 启用 product 页面`);
  
  const updated = db.prepare('SELECT id, name, display_name, visible_in_product, is_active FROM models WHERE id = ?').get(allModels[0].id);
  console.table([updated]);
}

db.close();
