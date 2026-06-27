import BetterSqlite3 from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data/hanxing_image.db');
const db = new BetterSqlite3(dbPath);

console.log('=== 检查 models 表结构 ===');
const tableInfo = db.prepare('PRAGMA table_info(models)').all();
console.table(tableInfo);

console.log('\n=== 查找 visible_in_product 字段 ===');
const hasField = tableInfo.find(col => col.name === 'visible_in_product');
console.log(hasField ? '✓ 字段存在' : '✗ 字段不存在');

if (!hasField) {
  console.log('\n正在添加 visible_in_product 字段...');
  try {
    db.exec("ALTER TABLE models ADD COLUMN visible_in_product INTEGER NOT NULL DEFAULT 0");
    console.log('✓ 字段添加成功');
  } catch (error) {
    console.error('✗ 添加失败:', error.message);
  }
}

db.close();
