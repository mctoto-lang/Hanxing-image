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
      allowed_pages TEXT DEFAULT '[]',
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
      task_type TEXT NOT NULL DEFAULT 'normal',
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

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON generation_tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON generation_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON generation_tasks(created_at);
    CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id);
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
  if (!groupColNames.has('allowed_pages')) {
    db.exec("ALTER TABLE permission_groups ADD COLUMN allowed_pages TEXT DEFAULT '[]'");
    console.log('已添加 allowed_pages 字段到 permission_groups');
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
  if (!taskColNames.has('task_type')) {
    db.exec("ALTER TABLE generation_tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'normal'");
    db.exec("UPDATE generation_tasks SET task_type = CASE WHEN source = 'workspace' THEN 'workspace_single' ELSE 'normal' END WHERE task_type IS NULL OR task_type = 'normal'");
    console.log('已添加 task_type 字段到 generation_tasks');
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
  if (!modelColNames.has('visible_in_workspace')) {
    db.exec("ALTER TABLE models ADD COLUMN visible_in_workspace INTEGER NOT NULL DEFAULT 1");
    console.log('已添加 visible_in_workspace 字段到 models');
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
  if (!modelColNames.has('api_timeout')) {
    db.exec("ALTER TABLE models ADD COLUMN api_timeout INTEGER NOT NULL DEFAULT 120");
    console.log('已添加 api_timeout 字段到 models');
  }
  if (!modelColNames.has('task_timeout')) {
    db.exec("ALTER TABLE models ADD COLUMN task_timeout INTEGER NOT NULL DEFAULT 0");
    console.log('已添加 task_timeout 字段到 models');
  }
  if (!modelColNames.has('default_image_count')) {
    db.exec("ALTER TABLE models ADD COLUMN default_image_count INTEGER NOT NULL DEFAULT 1");
    console.log('已添加 default_image_count 字段到 models');
  }

  // API 调用记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES generation_tasks(id),
      call_index INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      request_params TEXT,
      response_summary TEXT,
      elapsed_ms INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_api_call_logs_task_id ON api_call_logs(task_id);
  `);
  console.log('已创建 api_call_logs 表');

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
          max_retries INTEGER NOT NULL DEFAULT 3,
          api_timeout INTEGER NOT NULL DEFAULT 120,
          task_timeout INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          icon_url TEXT,
          supported_sizes TEXT,
          visible_in_generate INTEGER NOT NULL DEFAULT 1,
          visible_in_canvas INTEGER NOT NULL DEFAULT 1,
          visible_in_workspace INTEGER NOT NULL DEFAULT 1,
          supports_reference_image INTEGER NOT NULL DEFAULT 0,
          max_reference_images INTEGER NOT NULL DEFAULT 1,
          reference_image_field TEXT DEFAULT 'image_url',
          api_format TEXT NOT NULL DEFAULT 'openai',
          extra_config TEXT DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(name, api_endpoint)
        );
      `);
      // 动态检测旧表和新表共有的列，确保数据不丢失
      const oldModelCols = db.prepare("PRAGMA table_info(models)").all() as { name: string }[];
      const oldModelColNames = oldModelCols.map(c => c.name);
      const allNewCols = ['id', 'name', 'display_name', 'api_endpoint', 'api_key_encrypted', 'cost_per_image', 'max_concurrent', 'max_retries', 'api_timeout', 'task_timeout', 'is_active', 'icon_url', 'supported_sizes', 'visible_in_generate', 'visible_in_canvas', 'visible_in_workspace', 'supports_reference_image', 'max_reference_images', 'reference_image_field', 'api_format', 'extra_config', 'created_at', 'updated_at'];
      const commonCols = allNewCols.filter(c => oldModelColNames.includes(c));
      const colList = commonCols.join(', ');
      db.exec(`INSERT INTO models_new (${colList}) SELECT ${colList} FROM models`);
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

  // ===== 批量生图工作台相关表 =====

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_api_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      model TEXT NOT NULL,
      api_key TEXT NOT NULL,
      format_type TEXT NOT NULL DEFAULT 'openai',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prompt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      chat_api_id INTEGER REFERENCES chat_api_configs(id),
      fission_count INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workspace_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      theme_prompt TEXT NOT NULL,
      template_id INTEGER REFERENCES prompt_templates(id),
      status TEXT NOT NULL DEFAULT 'generating',
      card_count INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workspace_pinned_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      task_id INTEGER NOT NULL REFERENCES workspace_tasks(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, task_id)
    );

    CREATE TABLE IF NOT EXISTS prompt_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES workspace_tasks(id) ON DELETE CASCADE,
      card_index INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      selected_image_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS card_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL REFERENCES prompt_cards(id) ON DELETE CASCADE,
      image_api_id INTEGER REFERENCES models(id),
      image_url TEXT NOT NULL,
      size TEXT,
      format TEXT DEFAULT 'png',
      status TEXT NOT NULL DEFAULT 'generating',
      error_message TEXT,
      is_selected INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workspace_api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      api_type TEXT NOT NULL,
      api_config_id INTEGER,
      api_config_name TEXT,
      workspace_task_id INTEGER REFERENCES workspace_tasks(id),
      card_id INTEGER REFERENCES prompt_cards(id),
      request_params TEXT,
      response_status TEXT NOT NULL DEFAULT 'success',
      response_body TEXT,
      duration_ms INTEGER,
      retry_count INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_tasks_user_id ON workspace_tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_tasks_status ON workspace_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_workspace_pinned_tasks_user_id ON workspace_pinned_tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_prompt_cards_task_id ON prompt_cards(task_id);
    CREATE INDEX IF NOT EXISTS idx_card_images_card_id ON card_images(card_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_api_logs_user_id ON workspace_api_logs(user_id);
  `);

  console.log('批量生图工作台相关表已创建');

  // 为 workspace_api_logs 添加 generation_task_id 字段
  const workspaceApiLogsCols = db.prepare("PRAGMA table_info(workspace_api_logs)").all() as { name: string }[];
  const workspaceApiLogsColNames = new Set(workspaceApiLogsCols.map(c => c.name));
  if (!workspaceApiLogsColNames.has('generation_task_id')) {
    db.exec("ALTER TABLE workspace_api_logs ADD COLUMN generation_task_id INTEGER REFERENCES generation_tasks(id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_workspace_api_logs_generation_task_id ON workspace_api_logs(generation_task_id)");
    console.log('已添加 generation_task_id 字段和索引到 workspace_api_logs');
  }

  const cardImageCols = db.prepare("PRAGMA table_info(card_images)").all() as { name: string }[];
  const cardImageColNames = new Set(cardImageCols.map(c => c.name));
  if (!cardImageColNames.has('generation_task_id')) {
    db.exec("ALTER TABLE card_images ADD COLUMN generation_task_id INTEGER REFERENCES generation_tasks(id)");
    console.log('已添加 generation_task_id 字段到 card_images');
  }

  // ===== 对话API并发控制字段 =====
  const chatApiCols = db.prepare("PRAGMA table_info(chat_api_configs)").all() as { name: string }[];
  const chatApiColNames = new Set(chatApiCols.map(c => c.name));
  if (!chatApiColNames.has('max_concurrent')) {
    db.exec("ALTER TABLE chat_api_configs ADD COLUMN max_concurrent INTEGER NOT NULL DEFAULT 5");
    console.log('已添加 max_concurrent 字段到 chat_api_configs');
  }
  if (!chatApiColNames.has('max_retries')) {
    db.exec("ALTER TABLE chat_api_configs ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 3");
    console.log('已添加 max_retries 字段到 chat_api_configs');
  }
  if (!chatApiColNames.has('api_timeout')) {
    db.exec("ALTER TABLE chat_api_configs ADD COLUMN api_timeout INTEGER NOT NULL DEFAULT 120");
    console.log('已添加 api_timeout 字段到 chat_api_configs');
  }

  // ===== 对话API任务队列表 =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      chat_api_id INTEGER NOT NULL REFERENCES chat_api_configs(id),
      task_type TEXT NOT NULL DEFAULT 'deepen',
      card_id INTEGER NOT NULL REFERENCES prompt_cards(id),
      workspace_task_id INTEGER REFERENCES workspace_tasks(id),
      template_id INTEGER REFERENCES prompt_templates(id),
      original_prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      result_prompt TEXT,
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      retry_errors TEXT DEFAULT '[]',
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_chat_tasks_user_id ON chat_tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_tasks_status ON chat_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_chat_tasks_chat_api_id ON chat_tasks(chat_api_id);
  `);
  console.log('对话API任务队列表已创建');

  // ===== 商品主图生成功能相关表 =====

  // 1. 为 models 表添加商品主图页面可见性字段
  if (!modelColNames.has('visible_in_product')) {
    db.exec("ALTER TABLE models ADD COLUMN visible_in_product INTEGER NOT NULL DEFAULT 0");
    console.log('已添加 visible_in_product 字段到 models');
  }

  // 2. 为 generation_tasks 表添加模板信息字段
  if (!taskColNames.has('template_info')) {
    db.exec("ALTER TABLE generation_tasks ADD COLUMN template_info TEXT");
    console.log('已添加 template_info 字段到 generation_tasks');
  }

  // 3. 创建商品主图模板表
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_main_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      visibility TEXT NOT NULL DEFAULT 'private',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_product_main_templates_user_id ON product_main_templates(user_id);
    CREATE INDEX IF NOT EXISTS idx_product_main_templates_visibility ON product_main_templates(visibility);
  `);
  console.log('已创建 product_main_templates 表');

  // 4. 创建商品小模板表
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_sub_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      main_template_id INTEGER NOT NULL REFERENCES product_main_templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      fixed_prompt TEXT NOT NULL,
      fixed_reference_images TEXT DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_product_sub_templates_main_id ON product_sub_templates(main_template_id);
  `);
  console.log('已创建 product_sub_templates 表');

  // 5. 创建商品主图模板库图片表（用户上传的可点选参考图）
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_library_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_product_library_images_user_id ON product_library_images(user_id);
  `);
  console.log('已创建 product_library_images 表');

  console.log('商品主图生成功能相关表已创建');

  console.log('数据库迁移完成！');
}
