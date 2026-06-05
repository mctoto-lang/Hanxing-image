import crypto from 'crypto';
import { db } from './index.js';

export function migrate() {
  console.log('开始数据库迁移...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS permission_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      max_credits INTEGER NOT NULL DEFAULT 100,
      daily_credits INTEGER NOT NULL DEFAULT 0,
      initial_creative_credits INTEGER NOT NULL DEFAULT 0,
      initial_project_credits INTEGER NOT NULL DEFAULT 0,
      max_concurrent INTEGER NOT NULL DEFAULT 2,
      priority INTEGER NOT NULL DEFAULT 0,
      allowed_models TEXT DEFAULT '[]',
      managed_models TEXT DEFAULT '[]',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      credits INTEGER NOT NULL DEFAULT 0,
      creative_credits INTEGER NOT NULL DEFAULT 0,
      project_credits INTEGER NOT NULL DEFAULT 0,
      daily_credits_remaining INTEGER NOT NULL DEFAULT 0,
      daily_credits_date TEXT DEFAULT '',
      group_id INTEGER REFERENCES permission_groups(id),
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      display_name TEXT,
      api_endpoint TEXT NOT NULL,
      api_key_encrypted TEXT,
      cost_per_image INTEGER NOT NULL DEFAULT 1,
      max_concurrent INTEGER NOT NULL DEFAULT 5,
      is_active INTEGER DEFAULT 1,
      icon_url TEXT,
      supported_sizes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, api_endpoint)
    );

    CREATE TABLE IF NOT EXISTS generation_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      model_id INTEGER NOT NULL REFERENCES models(id),
      prompt TEXT NOT NULL,
      image_size TEXT NOT NULL DEFAULT '1024x1024',
      image_count INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'queued',
      priority INTEGER NOT NULL DEFAULT 0,
      credits_charged INTEGER NOT NULL DEFAULT 0,
      credits_type TEXT NOT NULL DEFAULT 'creative',
      source TEXT NOT NULL DEFAULT 'creative',
      result_images TEXT DEFAULT '[]',
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      ip_address TEXT,
      user_agent TEXT,
      login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gallery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES generation_tasks(id),
      image_url TEXT NOT NULL,
      is_public INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON generation_tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON generation_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON generation_tasks(created_at);
    CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_gallery_is_public ON gallery(is_public);
  `);

  const groupCols = db.prepare("PRAGMA table_info(permission_groups)").all() as { name: string }[];
  const groupColNames = new Set(groupCols.map(c => c.name));
  if (!groupColNames.has('daily_credits')) {
    db.exec("ALTER TABLE permission_groups ADD COLUMN daily_credits INTEGER NOT NULL DEFAULT 0");
    console.log('已添加 daily_credits 字段到 permission_groups');
  }
  if (!groupColNames.has('managed_models')) {
    db.exec("ALTER TABLE permission_groups ADD COLUMN managed_models TEXT DEFAULT '[]'");
    console.log('已添加 managed_models 字段到 permission_groups');
  }
  if (!groupColNames.has('initial_creative_credits')) {
    db.exec("ALTER TABLE permission_groups ADD COLUMN initial_creative_credits INTEGER NOT NULL DEFAULT 0");
    console.log('已添加 initial_creative_credits 字段到 permission_groups');
  }
  if (!groupColNames.has('initial_project_credits')) {
    db.exec("ALTER TABLE permission_groups ADD COLUMN initial_project_credits INTEGER NOT NULL DEFAULT 0");
    console.log('已添加 initial_project_credits 字段到 permission_groups');
  }

  const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const userColNames = new Set(userCols.map(c => c.name));
  if (!userColNames.has('daily_credits_remaining')) {
    db.exec("ALTER TABLE users ADD COLUMN daily_credits_remaining INTEGER NOT NULL DEFAULT 0");
    console.log('已添加 daily_credits_remaining 字段到 users');
  }
  if (!userColNames.has('daily_credits_date')) {
    db.exec("ALTER TABLE users ADD COLUMN daily_credits_date TEXT DEFAULT ''");
    console.log('已添加 daily_credits_date 字段到 users');
  }
  if (!userColNames.has('creative_credits')) {
    db.exec("ALTER TABLE users ADD COLUMN creative_credits INTEGER NOT NULL DEFAULT 0");
    console.log('已添加 creative_credits 字段到 users');
  }
  if (!userColNames.has('project_credits')) {
    db.exec("ALTER TABLE users ADD COLUMN project_credits INTEGER NOT NULL DEFAULT 0");
    console.log('已添加 project_credits 字段到 users');
  }

  const taskCols = db.prepare("PRAGMA table_info(generation_tasks)").all() as { name: string }[];
  const taskColNames = new Set(taskCols.map(c => c.name));
  if (!taskColNames.has('retry_count')) {
    db.exec("ALTER TABLE generation_tasks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0");
    console.log('已添加 retry_count 字段到 generation_tasks');
  }
  if (!taskColNames.has('credits_type')) {
    db.exec("ALTER TABLE generation_tasks ADD COLUMN credits_type TEXT NOT NULL DEFAULT 'creative'");
    console.log('已添加 credits_type 字段到 generation_tasks');
  }
  if (!taskColNames.has('source')) {
    db.exec("ALTER TABLE generation_tasks ADD COLUMN source TEXT NOT NULL DEFAULT 'creative'");
    console.log('已添加 source 字段到 generation_tasks');
  }
  if (!taskColNames.has('task_uuid')) {
    db.exec("ALTER TABLE generation_tasks ADD COLUMN task_uuid TEXT");
    console.log('已添加 task_uuid 字段到 generation_tasks');
  }
  // 为缺少 uuid 的已有记录生成
  const existingNoUuid = db.prepare("SELECT id FROM generation_tasks WHERE task_uuid IS NULL").all() as { id: number }[];
  if (existingNoUuid.length > 0) {
    const updateStmt = db.prepare("UPDATE generation_tasks SET task_uuid = ? WHERE id = ?");
    for (const t of existingNoUuid) {
      updateStmt.run(crypto.randomUUID(), t.id);
    }
    console.log(`已为 ${existingNoUuid.length} 条现有任务生成 task_uuid`);
  }
  if (!taskColNames.has('reference_images')) {
    db.exec("ALTER TABLE generation_tasks ADD COLUMN reference_images TEXT DEFAULT '[]'");
    console.log('已添加 reference_images 字段到 generation_tasks');
  }
  if (!taskColNames.has('retry_errors')) {
    db.exec("ALTER TABLE generation_tasks ADD COLUMN retry_errors TEXT DEFAULT '[]'");
    console.log('已添加 retry_errors 字段到 generation_tasks');
  }

  const modelCols = db.prepare("PRAGMA table_info(models)").all() as { name: string }[];
  const modelColNames = new Set(modelCols.map(c => c.name));
  if (!modelColNames.has('visible_in_generate')) {
    db.exec("ALTER TABLE models ADD COLUMN visible_in_generate INTEGER NOT NULL DEFAULT 1");
    console.log('已添加 visible_in_generate 字段到 models');
  }
  if (!modelColNames.has('visible_in_canvas')) {
    db.exec("ALTER TABLE models ADD COLUMN visible_in_canvas INTEGER NOT NULL DEFAULT 1");
    console.log('已添加 visible_in_canvas 字段到 models');
  }
  if (!modelColNames.has('supports_reference_image')) {
    db.exec("ALTER TABLE models ADD COLUMN supports_reference_image INTEGER NOT NULL DEFAULT 0");
    console.log('已添加 supports_reference_image 字段到 models');
  }
  if (!modelColNames.has('max_reference_images')) {
    db.exec("ALTER TABLE models ADD COLUMN max_reference_images INTEGER NOT NULL DEFAULT 1");
    console.log('已添加 max_reference_images 字段到 models');
  }
  if (!modelColNames.has('reference_image_field')) {
    db.exec("ALTER TABLE models ADD COLUMN reference_image_field TEXT DEFAULT 'image_url'");
    console.log('已添加 reference_image_field 字段到 models');
  }
  if (!modelColNames.has('max_retries')) {
    db.exec("ALTER TABLE models ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 3");
    console.log('已添加 max_retries 字段到 models');
  }
  if (!modelColNames.has('api_format')) {
    db.exec("ALTER TABLE models ADD COLUMN api_format TEXT NOT NULL DEFAULT 'openai'");
    console.log('已添加 api_format 字段到 models');
  }
  if (!modelColNames.has('extra_config')) {
    db.exec("ALTER TABLE models ADD COLUMN extra_config TEXT DEFAULT '{}'");
    console.log('已添加 extra_config 字段到 models');
  }

  try {
    const createSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='models'").get() as { sql: string } | undefined;
    const hasOldUnique = createSql && /name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(createSql.sql);
    if (hasOldUnique) {
      db.pragma('foreign_keys = OFF');
      db.exec(`DROP TABLE IF EXISTS models_new`);
      db.exec(`
        CREATE TABLE models_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          display_name TEXT,
          api_endpoint TEXT NOT NULL,
          api_key_encrypted TEXT,
          cost_per_image INTEGER NOT NULL DEFAULT 1,
          max_concurrent INTEGER NOT NULL DEFAULT 5,
          is_active INTEGER DEFAULT 1,
          icon_url TEXT,
          supported_sizes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(name, api_endpoint)
        );
      `);
      db.exec(`INSERT INTO models_new (id, name, display_name, api_endpoint, api_key_encrypted, cost_per_image, max_concurrent, is_active, icon_url, supported_sizes, created_at, updated_at) SELECT id, name, display_name, api_endpoint, api_key_encrypted, cost_per_image, max_concurrent, is_active, icon_url, supported_sizes, created_at, updated_at FROM models`);
      db.exec(`DROP TABLE models`);
      db.exec(`ALTER TABLE models_new RENAME TO models`);
      db.pragma('foreign_keys = ON');
      console.log('已更新 models 表约束：移除 name UNIQUE，改为 (name, api_endpoint) 组合唯一');
    }
  } catch (e) {
    db.pragma('foreign_keys = ON');
    console.log('models 表约束检查跳过:', e);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS pinned_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      task_id INTEGER NOT NULL REFERENCES generation_tasks(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, task_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pinned_tasks_user_id ON pinned_tasks(user_id);
  `);

  db.exec(`
    INSERT OR IGNORE INTO system_settings (key, value) VALUES
    ('storage_provider', 'local'),
    ('cos_secret_id', ''),
    ('cos_secret_key', ''),
    ('cos_bucket', ''),
    ('cos_region', ''),
    ('cos_base_url', ''),
    ('cos_image_prefix', 'image/'),
    ('local_image_prefix', 'image/'),
    ('queue_green_threshold', '10'),
    ('queue_yellow_threshold', '15')
  `);

  console.log('数据库迁移完成！');
}
