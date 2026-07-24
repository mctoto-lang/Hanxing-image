export const workspaceImageHistoryQuery = `SELECT ci.id, ci.image_url, ci.size, ci.created_at, ci.is_selected,
              pc.prompt, pc.card_index,
              t.id as task_id, t.title as task_title, t.created_at as task_created_at
       FROM card_images ci
       JOIN prompt_cards pc ON ci.card_id = pc.id
       JOIN workspace_tasks t ON pc.task_id = t.id
       WHERE t.user_id = ? AND ci.status = 'completed' AND ci.image_url != ''
         AND COALESCE(ci.source, 'generated') = 'generated'
       ORDER BY ci.created_at DESC LIMIT ?`
