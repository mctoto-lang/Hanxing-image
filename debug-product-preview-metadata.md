[OPEN] product-preview-metadata

- 症状：商品主图页面点击画布图片右上角眼睛后，预览弹层只有下载按钮，没有提示词、图片尺寸、图片模型、生成耗时。
- 期望：预览弹层与其他页面一致，显示完整元信息。
- 当前状态：等待收集运行时证据并确认元数据在前端链路中的丢失位置。

- 假设 1：`/api/tasks?ids=` 返回的任务对象本身不包含 `prompt`、`model_name`、`image_size`、`started_at`、`completed_at`。
- 假设 2：`historyImages.find(h => h.url === img.url)` 未匹配到记录，导致传入预览组件的 `item` 为 `null`。
- 假设 3：初始化历史记录时使用的 `/api/tasks/history?source=product` 响应被归一化时丢弃了元数据字段。
- 假设 4：预览打开时传入的字段名或字段值类型与 `ImagePreviewOverlay` 预期不一致，导致条件渲染未命中。
- 假设 5：画布中的图片来源与历史记录中的 URL 经过转换后不一致，导致只拿到了 `imageUrl`，没有拿到关联任务信息。
