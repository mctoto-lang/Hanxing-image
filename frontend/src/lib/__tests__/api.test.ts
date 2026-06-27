import { describe, it, expect } from 'vitest'
import { safeResponseJson } from '../api'

describe('safeResponseJson', () => {
  it('returns parsed JSON for valid JSON response body', async () => {
    const res = new Response(JSON.stringify({ task_ids: [1, 2] }), {
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await safeResponseJson(res)
    expect(data).toEqual({ task_ids: [1, 2] })
  })

  it('returns empty object when response body is empty (Unexpected end of JSON input)', async () => {
    const res = new Response('', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    })
    const data = await safeResponseJson(res)
    expect(data).toEqual({})
  })

  it('returns empty object when response body is not valid JSON', async () => {
    const res = new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    })
    const data = await safeResponseJson(res)
    expect(data).toEqual({})
  })

  it('returns parsed JSON even when content-type is missing but body is valid JSON', async () => {
    const res = new Response(JSON.stringify({ error: '积分不足' }))
    const data = await safeResponseJson(res)
    expect(data).toEqual({ error: '积分不足' })
  })
})
