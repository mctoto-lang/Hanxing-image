export const workspaceImageHistoryQuery = `SELECT ci.id, ci.image_url, ci.size, ci.created_at, ci.is_selected,
              pc.prompt, pc.card_index,
              t.id as task_id, t.title as task_title, t.created_at as task_created_at,
              gt.started_at, gt.completed_at,
              COALESCE(
                (SELECT wl.api_config_name FROM workspace_api_logs wl
                 WHERE wl.generation_task_id = ci.generation_task_id AND wl.api_type = 'image'
                 ORDER BY wl.id DESC LIMIT 1),
                m.display_name
              ) as model_name
       FROM card_images ci
       JOIN prompt_cards pc ON ci.card_id = pc.id
       JOIN workspace_tasks t ON pc.task_id = t.id
       LEFT JOIN generation_tasks gt ON ci.generation_task_id = gt.id
       LEFT JOIN models m ON gt.model_id = m.id
       WHERE t.user_id = ? AND ci.status = 'completed' AND ci.image_url != ''
         AND COALESCE(ci.source, 'generated') = 'generated'
       ORDER BY ci.created_at DESC LIMIT ?`
