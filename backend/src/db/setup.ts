import { migrate } from './migrate.js';
import { seed } from './seed.js';

console.log('开始数据库初始化...');
migrate();
seed().then(() => {
  console.log('数据库初始化完成！');
}).catch((err) => {
  console.error('数据库初始化失败:', err.message);
  process.exit(1);
});
