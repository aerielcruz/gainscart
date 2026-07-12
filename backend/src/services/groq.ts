// Shared low-level Groq caller, used by both the per-item "Why this pick?"
// explanation (explain.ts) and the whole-basket summary (basketSummary.ts).
// Groq's free tier (OpenAI-compatible chat completions API) since this is a
// research prototype with no ongoing budget for paid API calls -- switched
// from Gemini after finding that provider's free tier had a 0-request quota
// for this account/region.

export async function callGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured on the server')
  }

  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant'
  const url = 'https://api.groq.com/openai/v1/chat/completions'

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Groq request failed (${res.status}): ${body.slice(0, 200)}`)
  }

  const data: any = await res.json()
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) {
    throw new Error('Groq response had no explanation text')
  }

  return text
}
