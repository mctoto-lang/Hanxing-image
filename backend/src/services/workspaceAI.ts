import { query } from '../db/index.js';
import { decrypt } from './crypto.js';
import { getExecutableWorkspaceTemplate } from '../lib/workspace-template-access.js';

const DEFAULT_API_TIMEOUT_MS = 120000;

interface ChatApiConfig {
  id: number;
  name: string;
  endpoint: string;
  model: string;
  api_key: string;
  format_type: string;
}

export interface NumberedPromptItem {
  card_index: number;
  prompt: string;
}

function normalizeNumberedPromptItem(item: any): NumberedPromptItem | null {
  const rawIndex = item?.card_index ?? item?.number ?? item?.index ?? item?.序号 ?? item?.编号;
  const rawPrompt = item?.prompt ?? item?.content ?? item?.text ?? item?.提示词 ?? item?.描述;
  const cardIndex = Number(rawIndex);
  const prompt = typeof rawPrompt === 'string' ? rawPrompt.trim() : '';

  if (!Number.isInteger(cardIndex) || cardIndex <= 0 || !prompt) return null;
  return { card_index: cardIndex, prompt };
}

export function extractNumberedPrompts(aiResponse: string): NumberedPromptItem[] {
  const text = aiResponse.trim();
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = jsonMatch?.[1]?.trim() || text;

  try {
    const parsed = JSON.parse(jsonText);
    const rawItems = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed?.prompts) ? parsed.prompts : [];
    const items = rawItems.map(normalizeNumberedPromptItem).filter(Boolean) as NumberedPromptItem[];
    if (items.length > 0) return items.sort((a, b) => a.card_index - b.card_index);
  } catch {}

  const numberedPattern = /(?:^|\n)\s*(?:#\s*)?(\d+)\s*[.。:：)）]\s*([\s\S]*?)(?=\n\s*(?:#\s*)?\d+\s*[.。:：)）]|$)/g;
  const items: NumberedPromptItem[] = [];
  let m;
  while ((m = numberedPattern.exec(text)) !== null) {
    const cardIndex = Number(m[1]);
    const prompt = m[2].trim();
    if (Number.isInteger(cardIndex) && cardIndex > 0 && prompt) {
      items.push({ card_index: cardIndex, prompt });
    }
  }

  return items.sort((a, b) => a.card_index - b.card_index);
}

export function extractPrompts(aiResponse: string): string[] {
  const text = aiResponse.trim();

  const numberedPattern = /(?:^|\n)\s*(\d+)\s*[.。)）]\s*([\s\S]*?)(?=\n\s*\d+\s*[.。)）]|$)/g;
  const numberedMatches: { index: number; content: string }[] = [];
  let m;
  while ((m = numberedPattern.exec(text)) !== null) {
    const content = m[2].trim();
    if (content) {
      numberedMatches.push({ index: parseInt(m[1]), content });
    }
  }
  if (numberedMatches.length >= 2) {
    return numberedMatches.sort((a, b) => a.index - b.index).map(x => x.content);
  }

  const listPattern = /(?:^|\n)\s*[-•*]\s+([\s\S]*?)(?=\n\s*[-•*]|$)/g;
  const listMatches: string[] = [];
  while ((m = listPattern.exec(text)) !== null) {
    const content = m[1].trim();
    if (content) listMatches.push(content);
  }
  if (listMatches.length >= 2) return listMatches;

  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20);
  if (paragraphs.length >= 2) return paragraphs;

  return [text];
}

async function callChatAPI(config: ChatApiConfig, systemPrompt: string, userMessage: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_API_TIMEOUT_MS);

  try {
    const endpoint = config.endpoint.replace(/\/$/, '');
    const url = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.8,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API 响应错误 ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json() as any;
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('API 响应中未找到内容');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

export async function fissionPrompts(
  templateId: number,
  themePrompt: string,
  workspaceTaskId: number,
  userId: number
): Promise<string[]> {
  const template = getExecutableWorkspaceTemplate(templateId, 'fission', userId);
  if (!template) throw new Error('裂变模板不存在');
  if (!template.api_key) throw new Error('裂变模板未关联可用的对话模型');

  const fissionCount = template.fission_count || 10;
  const content = template.content
    .replace(/\{\{prompt\}\}/g, themePrompt)
    .replace(/\{\{count\}\}/g, String(fissionCount));

  const startTime = Date.now();
  let responseText = '';
  let logStatus = 'success';
  let logError = '';

  try {
    const config: ChatApiConfig = {
      id: template.chat_api_id,
      name: template.api_name || template.name,
      endpoint: template.endpoint,
      model: template.model,
      api_key: decrypt(template.api_key || ''),
      format_type: template.format_type || 'openai',
    };
    responseText = await callChatAPI(config, '', content);
  } catch (err) {
    logStatus = 'failure';
    logError = (err as Error).message;
    query(
      `INSERT INTO workspace_api_logs (user_id, api_type, api_config_id, api_config_name, workspace_task_id, request_params, response_status, error_message, duration_ms) VALUES (?,?,?,?,?,?,?,?,?)`,
      [userId, 'chat', template.chat_api_id, template.api_name, workspaceTaskId, JSON.stringify({ template_id: templateId, theme_prompt: themePrompt.slice(0, 200) }), logStatus, logError, Date.now() - startTime]
    );
    throw err;
  }

  const elapsed = Date.now() - startTime;
  query(
    `INSERT INTO workspace_api_logs (user_id, api_type, api_config_id, api_config_name, workspace_task_id, request_params, response_status, response_body, duration_ms) VALUES (?,?,?,?,?,?,?,?,?)`,
    [userId, 'chat', template.chat_api_id, template.api_name, workspaceTaskId, JSON.stringify({ template_id: templateId, theme_prompt: themePrompt.slice(0, 200) }), logStatus, responseText.slice(0, 1000), elapsed]
  );

  return extractPrompts(responseText);
}

export async function extractPromptDescriptions(
  templateId: number,
  rawPromptText: string,
  workspaceTaskId: number,
  userId: number
): Promise<string[]> {
  const template = getExecutableWorkspaceTemplate(templateId, 'extract', userId);
  if (!template) throw new Error('提取提示词模板不存在');
  if (!template.api_key) throw new Error('提取提示词模板未关联可用的对话模型');

  const content = template.content.replace(/\{\{prompt\}\}/g, rawPromptText);

  const startTime = Date.now();
  let responseText = '';
  let logStatus = 'success';
  let logError = '';

  try {
    const config: ChatApiConfig = {
      id: template.chat_api_id,
      name: template.api_name || template.name,
      endpoint: template.endpoint,
      model: template.model,
      api_key: decrypt(template.api_key || ''),
      format_type: template.format_type || 'openai',
    };
    responseText = await callChatAPI(config, '', content);
  } catch (err) {
    logStatus = 'failure';
    logError = (err as Error).message;
    query(
      `INSERT INTO workspace_api_logs (user_id, api_type, api_config_id, api_config_name, workspace_task_id, request_params, response_status, error_message, duration_ms) VALUES (?,?,?,?,?,?,?,?,?)`,
      [userId, 'chat', template.chat_api_id, template.api_name, workspaceTaskId, JSON.stringify({ template_id: templateId, extract_prompt: rawPromptText.slice(0, 200) }), logStatus, logError, Date.now() - startTime]
    );
    throw err;
  }

  const elapsed = Date.now() - startTime;
  query(
    `INSERT INTO workspace_api_logs (user_id, api_type, api_config_id, api_config_name, workspace_task_id, request_params, response_status, response_body, duration_ms) VALUES (?,?,?,?,?,?,?,?,?)`,
    [userId, 'chat', template.chat_api_id, template.api_name, workspaceTaskId, JSON.stringify({ template_id: templateId, extract_prompt: rawPromptText.slice(0, 200) }), logStatus, responseText.slice(0, 1000), elapsed]
  );

  return extractPrompts(responseText);
}

export async function extractNumberedPromptReplacements(
  templateId: number,
  rawPromptText: string,
  workspaceTaskId: number,
  userId: number
): Promise<NumberedPromptItem[]> {
  const template = getExecutableWorkspaceTemplate(templateId, 'extract', userId);
  if (!template) throw new Error('提取提示词模板不存在');
  if (!template.api_key) throw new Error('提取提示词模板未关联可用的对话模型');

  const content = `${template.content.replace(/\{\{prompt\}\}/g, rawPromptText)}\n\n请仅返回 JSON 数组，数组项格式为 {"card_index": 数字编号, "prompt": "提示词"}。`;

  const startTime = Date.now();
  let responseText = '';
  let logStatus = 'success';
  let logError = '';

  try {
    const config: ChatApiConfig = {
      id: template.chat_api_id,
      name: template.api_name || template.name,
      endpoint: template.endpoint,
      model: template.model,
      api_key: decrypt(template.api_key || ''),
      format_type: template.format_type || 'openai',
    };
    responseText = await callChatAPI(config, '', content);
  } catch (err) {
    logStatus = 'failure';
    logError = (err as Error).message;
    query(
      `INSERT INTO workspace_api_logs (user_id, api_type, api_config_id, api_config_name, workspace_task_id, request_params, response_status, error_message, duration_ms) VALUES (?,?,?,?,?,?,?,?,?)`,
      [userId, 'chat', template.chat_api_id, template.api_name, workspaceTaskId, JSON.stringify({ template_id: templateId, extract_prompt: rawPromptText.slice(0, 200), mode: 'numbered_replacement' }), logStatus, logError, Date.now() - startTime]
    );
    throw err;
  }

  const elapsed = Date.now() - startTime;
  query(
    `INSERT INTO workspace_api_logs (user_id, api_type, api_config_id, api_config_name, workspace_task_id, request_params, response_status, response_body, duration_ms) VALUES (?,?,?,?,?,?,?,?,?)`,
    [userId, 'chat', template.chat_api_id, template.api_name, workspaceTaskId, JSON.stringify({ template_id: templateId, extract_prompt: rawPromptText.slice(0, 200), mode: 'numbered_replacement' }), logStatus, responseText.slice(0, 1000), elapsed]
  );

  return extractNumberedPrompts(responseText);
}

export async function deepenPrompt(
  templateId: number,
  currentPrompt: string,
  cardId: number,
  workspaceTaskId: number,
  userId: number,
  templateType: 'deepen' | 'regenerate' = 'deepen'
): Promise<string> {
  const template = getExecutableWorkspaceTemplate(templateId, templateType, userId);
  if (!template) throw new Error('模板不存在');
  if (!template.api_key) throw new Error('模板未关联可用的对话模型');

  const content = template.content.replace(/\{\{prompt\}\}/g, currentPrompt);

  const startTime = Date.now();
  let responseText = '';
  let logStatus = 'success';
  let logError = '';

  try {
    const config: ChatApiConfig = {
      id: template.chat_api_id,
      name: template.api_name,
      endpoint: template.endpoint,
      model: template.model,
      api_key: decrypt(template.api_key || ''),
      format_type: template.format_type || 'openai',
    };
    responseText = await callChatAPI(config, '', content);
  } catch (err) {
    logStatus = 'failure';
    logError = (err as Error).message;
    query(
      `INSERT INTO workspace_api_logs (user_id, api_type, api_config_id, api_config_name, workspace_task_id, card_id, request_params, response_status, error_message, duration_ms) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [userId, 'chat', template.chat_api_id, template.api_name, workspaceTaskId, cardId, JSON.stringify({ template_id: templateId, prompt: currentPrompt.slice(0, 200) }), logStatus, logError, Date.now() - startTime]
    );
    throw err;
  }

  const elapsed = Date.now() - startTime;
  query(
    `INSERT INTO workspace_api_logs (user_id, api_type, api_config_id, api_config_name, workspace_task_id, card_id, request_params, response_status, response_body, duration_ms) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [userId, 'chat', template.chat_api_id, template.api_name, workspaceTaskId, cardId, JSON.stringify({ template_id: templateId, prompt: currentPrompt.slice(0, 200) }), logStatus, responseText.slice(0, 1000), elapsed]
  );

  return responseText.trim();
}

export async function translatePrompt(
  templateId: number,
  currentPrompt: string,
  cardId: number,
  workspaceTaskId: number,
  userId: number
): Promise<string> {
  const template = getExecutableWorkspaceTemplate(templateId, 'translate', userId);
  if (!template) throw new Error('提示词翻译模板不存在');
  if (!template.api_key) throw new Error('提示词翻译模板未关联可用的对话模型');

  const content = template.content.replace(/\{\{prompt\}\}/g, currentPrompt);
  const startTime = Date.now();
  try {
    const responseText = await callChatAPI({
      id: template.chat_api_id,
      name: template.api_name || template.name,
      endpoint: template.endpoint,
      model: template.model,
      api_key: decrypt(template.api_key || ''),
      format_type: template.format_type || 'openai',
    }, '', content);
    const translatedPrompt = responseText.trim();
    query(
      `INSERT INTO workspace_api_logs (user_id, api_type, api_config_id, api_config_name, workspace_task_id, card_id, request_params, response_status, response_body, duration_ms) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [userId, 'chat', template.chat_api_id, template.api_name, workspaceTaskId, cardId, JSON.stringify({ template_id: templateId, prompt: currentPrompt.slice(0, 200), operation: 'translate' }), 'success', translatedPrompt.slice(0, 1000), Date.now() - startTime]
    );
    return translatedPrompt;
  } catch (err) {
    query(
      `INSERT INTO workspace_api_logs (user_id, api_type, api_config_id, api_config_name, workspace_task_id, card_id, request_params, response_status, error_message, duration_ms) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [userId, 'chat', template.chat_api_id, template.api_name, workspaceTaskId, cardId, JSON.stringify({ template_id: templateId, prompt: currentPrompt.slice(0, 200), operation: 'translate' }), 'failure', (err as Error).message, Date.now() - startTime]
    );
    throw err;
  }
}
