import { authenticate } from '../plugins/auth.js'

/**
 * AI Routes for Echo API.
 *
 * POST /api/rooms/:roomId/threads/:eventId/summarize
 *   Generates a summary of a thread using an LLM provider.
 *   Falls back to extractive summary if no AI provider is configured.
 */
export function registerAiRoutes(app) {
  app.post(
    '/api/rooms/:roomId/threads/:eventId/summarize',
    { preHandler: authenticate },
    async (request, reply) => {
      const { roomId, eventId } = request.params
      const accessToken = request.user?.accessToken
      const userId = request.user?.userId

      if (!accessToken || !userId) {
        return reply.code(401).send({ error: 'Unauthorized' })
      }

      try {
        // Fetch thread messages from Synapse via Matrix proxy
        const synapseUrl = process.env.SYNAPSE_URL || 'https://echo.litteris.online'
        const threadRes = await fetch(
          `${synapseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/relations/${encodeURIComponent(eventId)}?limit=50`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(10000),
          }
        )

        if (!threadRes.ok) {
          return reply.code(threadRes.status).send({ error: 'Failed to fetch thread' })
        }

        const threadData = await threadRes.json()
        const events = threadData.chunk || []

        if (events.length === 0) {
          return reply.send({ summary: 'Thread vazia.', messageCount: 0 })
        }

        // Extract message bodies for summarization
        const messages = events
          .filter((e) => e.type === 'm.room.message' && e.content?.body)
          .map((e) => ({
            sender: e.sender,
            body: e.content.body,
            ts: e.origin_server_ts,
          }))
          .sort((a, b) => a.ts - b.ts)

        if (messages.length === 0) {
          return reply.send({ summary: 'Nenhuma mensagem de texto na thread.', messageCount: events.length })
        }

        // Check if AI provider is configured
        const aiProvider = process.env.AI_PROVIDER || ''
        const aiApiKey = process.env.AI_API_KEY || ''

        let summary

        if (aiProvider === 'openai' && aiApiKey) {
          summary = await summarizeWithOpenAI(messages, aiApiKey)
        } else if (aiProvider === 'ollama' && process.env.OLLAMA_URL) {
          summary = await summarizeWithOllama(messages, process.env.OLLAMA_URL)
        } else {
          // Fallback: extractive summary (first + last messages + key phrases)
          summary = generateExtractiveSummary(messages)
        }

        return reply.send({
          summary,
          messageCount: messages.length,
          provider: aiProvider || 'extractive',
        })
      } catch (error) {
        app.log.error(`[AI] Thread summary failed: ${error.message}`)
        return reply.code(500).send({ error: 'Failed to generate summary' })
      }
    }
  )
}

/**
 * Summarize using OpenAI-compatible API.
 */
async function summarizeWithOpenAI(messages, apiKey) {
  const conversationText = messages
    .map((m) => `${m.sender}: ${m.body}`)
    .join('\n')

  const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1'
  const model = process.env.AI_MODEL || 'gpt-4o-mini'

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'Você é um assistente que resume threads de chat. Gere um resumo conciso em português (2-4 frases) destacando os pontos principais, decisões e ações. Não mencione nomes de usuários.',
        },
        {
          role: 'user',
          content: `Resuma esta thread:\n\n${conversationText.slice(0, 8000)}`,
        },
      ],
      max_tokens: 300,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    throw new Error(`AI API returned ${res.status}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || 'Resumo não disponível.'
}

/**
 * Summarize using local Ollama instance.
 */
async function summarizeWithOllama(messages, ollamaUrl) {
  const conversationText = messages
    .map((m) => `${m.sender}: ${m.body}`)
    .join('\n')

  const model = process.env.OLLAMA_MODEL || 'llama3.2'

  const res = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: `Resuma esta thread de chat em 2-4 frases em português:\n\n${conversationText.slice(0, 6000)}`,
      stream: false,
    }),
    signal: AbortSignal.timeout(60000),
  })

  if (!res.ok) {
    throw new Error(`Ollama returned ${res.status}`)
  }

  const data = await res.json()
  return data.response || 'Resumo não disponível.'
}

/**
 * Fallback extractive summary when no AI provider is configured.
 * Picks first message, last message, and longest message as key points.
 */
function generateExtractiveSummary(messages) {
  if (messages.length <= 2) {
    return messages.map((m) => m.body).join(' ')
  }

  const first = messages[0].body
  const last = messages[messages.length - 1].body
  const longest = messages.reduce((prev, curr) =>
    curr.body.length > prev.body.length ? curr : prev
  ).body

  const parts = [first]
  if (longest !== first && longest !== last) parts.push(longest)
  if (last !== first) parts.push(last)

  const unique = [...new Set(parts)]
  return `Resumo da thread (${messages.length} mensagens): ${unique.join(' | ')}`
}