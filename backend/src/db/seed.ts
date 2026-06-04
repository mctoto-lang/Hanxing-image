import bcrypt from 'bcryptjs';
import { db } from './index.js';

export async function seed() {
  console.log('开始数据库种子数据...');

  const adminUsername = process.env.ADMIN_USERNAME || 'HX2026ADMIN';
  const adminPassword = process.env.ADMIN_PASSWORD || '147258369';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  db.prepare(
    `INSERT OR IGNORE INTO permission_groups (name, description, max_credits, max_concurrent, priority, allowed_models)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('默认用户组', '普通用户默认权限组', 100, 2, 0, '[]');

  db.prepare(
    `INSERT OR IGNORE INTO permission_groups (name, description, max_credits, max_concurrent, priority, allowed_models)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('管理员组', '管理员权限组', 99999, 10, 99, '[]');

  db.prepare(
    `INSERT OR IGNORE INTO users (username, password_hash, role, credits, group_id)
     VALUES (?, ?, ?, ?, (SELECT id FROM permission_groups WHERE name = '管理员组'))`
  ).run(adminUsername, passwordHash, 'admin', 99999);

  console.log('数据库种子数据完成！');
  console.log(`管理员账号: ${adminUsername}`);
}
