export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ ok: false })

  const token = String(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || '').trim()
  if (!token) return res.status(500).json({ ok: false, error: 'missing-gateway-token' })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  const startedAt = Date.now()
  try {
    const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.6-flash',
        messages: [{ role: 'user', content: 'Return the word OK.' }],
        stream: false,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'probe',
            strict: true,
            schema: {
              type: 'object',
              properties: { answer: { type: 'string' } },
              required: ['answer'],
              additionalProperties: false,
            },
          },
        },
      }),
      signal: controller.signal,
    })
    const text = await response.text()
    let payload = null
    try { payload = text ? JSON.parse(text) : null } catch { payload = null }
    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      ms: Date.now() - startedAt,
      model: String(payload?.model || ''),
      content: String(payload?.choices?.[0]?.message?.content || '').slice(0, 180),
      error: String(payload?.error?.message || payload?.error || '').slice(0, 220),
    })
  } catch (error) {
    return res.status(200).json({ ok: false, status: 0, ms: Date.now() - startedAt, error: String(error?.message || error).slice(0, 220) })
  } finally {
    clearTimeout(timer)
  }
}
