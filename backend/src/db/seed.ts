import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './index.js';

export async function seed() {
  console.log('开始数据库种子数据...');

  const adminUsername = process.env.ADMIN_USERNAME || 'HX2026ADMIN';

  db.prepare(
    `INSERT OR IGNORE INTO permission_groups (name, description, max_credits, max_concurrent, priority, allowed_models)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('默认用户组', '普通用户默认权限组', 100, 2, 0, '[]');

  db.prepare(
    `INSERT OR IGNORE INTO permission_groups (name, description, max_credits, max_concurrent, priority, allowed_models)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('管理员组', '管理员权限组', 99999, 10, 99, '[]');

  // 仅在用户不存在时创建（首次初始化），避免每次启动都生成随机密码
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
  if (!existing) {
    // 如果未配置管理员密码，生成随机安全密码
    let adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword || adminPassword === '147258369') {
      adminPassword = crypto.randomBytes(12).toString('base64url').slice(0, 16);
      console.log('========================================');
      console.log('⚠️  未配置安全的管理员密码，已自动生成随机密码');
      console.log(`管理员账号: ${adminUsername}`);
      console.log(`管理员密码: ${adminPassword}`);
      console.log('请妥善保存，并在登录后立即修改密码！');
      console.log('========================================');
    }
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    db.prepare(
      `INSERT INTO users (username, password_hash, role, credits, group_id)
       VALUES (?, ?, ?, ?, (SELECT id FROM permission_groups WHERE name = '管理员组'))`
    ).run(adminUsername, passwordHash, 'admin', 99999);
    console.log(`管理员账号已创建: ${adminUsername}`);
  } else {
    console.log('管理员账号已存在，跳过创建');
  }

  console.log('数据库种子数据完成！');
}
