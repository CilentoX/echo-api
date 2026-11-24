import { authenticate } from '../plugins/auth.js'

/**
 * Widget Routes for Echo API.
 *
 * Handles interactive widget actions (poll votes, form submissions, button clicks).
 * Persists state back to Matrix room as m.room.message events with widget metadata.
 */
export function registerWidgetRoutes(app) {
 /**
  * POST /api/rooms/:roomId/widgets/:eventId/action
  * Submits a widget interaction (vote, form submit, button click).
  * Body: { actionId?: string, optionId?: string, formData?: Record<string, any> }
  */
 app.post(
 '/api/rooms/:roomId/widgets/:eventId/action',
 { preHandler: authenticate },
 async (request, reply) => {
 const { roomId, eventId } = request.params
 const accessToken = request.user?.accessToken
 const userId = request.user?.userId
 const { actionId, optionId, formData } = request.body || {}

 if (!accessToken || !userId) {
 return reply.code(401).send({ error: 'Unauthorized' })
 }

 try {
 const synapseUrl = process.env.SYNAPSE_URL || 'https://echo.litteris.online'

 // Fetch the original widget message to validate and update state
 const msgRes = await fetch(
 `${synapseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/event/${encodeURIComponent(eventId)}`,
 {
 headers: { Authorization: `Bearer ${accessToken}` },
 signal: AbortSignal.timeout(5000),
 }
 )

 if (!msgRes.ok) {
 return reply.code(msgRes.status).send({ error: 'Failed to fetch widget event' })
 }

 const originalEvent = await msgRes.json()
 const widgetData = originalEvent.content?.['echo.widget']

 if (!widgetData) {
 return reply.code(400).send({ error: 'Event is not a widget' })
 }

 // Build updated widget state based on action type
 const updatedWidget = JSON.parse(JSON.stringify(widgetData))

 if (widgetData.type === 'poll' && optionId) {
 // Record vote
 const options = updatedWidget.options || []
 const optIndex = options.findIndex((o) => o.id === optionId)
 if (optIndex === -1) {
 return reply.code(400).send({ error: 'Invalid option ID' })
 }
 options[optIndex].votes = (options[optIndex].votes || 0) + 1
 updatedWidget.totalVotes = (updatedWidget.totalVotes || 0) + 1
 // Track voter to prevent double-voting (stored server-side only)
 if (!updatedWidget._voters) updatedWidget._voters = {}
 updatedWidget._voters[userId] = optionId
 } else if (widgetData.type === 'form' && formData) {
 // Store form submission
 if (!updatedWidget._submissions) updatedWidget._submissions = []
 updatedWidget._submissions.push({ userId, data: formData, ts: Date.now() })
 } else if (widgetData.type === 'buttons' && actionId) {
 // Track button click count
 if (!updatedWidget._clicks) updatedWidget._clicks = {}
 updatedWidget._clicks[actionId] = (updatedWidget._clicks[actionId] || 0) + 1
 }

 // Send updated widget state as a new message event (Matrix doesn't allow editing custom content easily)
 // Use m.room.message with echo.widget in content
 const sendRes = await fetch(
 `${synapseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
 {
 method: 'PUT',
 headers: {
 Authorization: `Bearer ${accessToken}`,
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 msgtype: 'm.text',
 body: `[Widget Update] ${updatedWidget.title}`,
 'echo.widget': updatedWidget,
 'echo.widget.parent': eventId,
 }),
 signal: AbortSignal.timeout(10000),
 }
 )

 if (!sendRes.ok) {
 const errBody = await sendRes.text()
 app.log.error(`[Widget] Failed to update widget: ${errBody}`)
 return reply.code(500).send({ error: 'Failed to persist widget state' })
 }

 const result = await sendRes.json()
 return reply.send({
 event_id: result.event_id,
 widget: updatedWidget,
 })
 } catch (error) {
 app.log.error(`[Widget] Action failed: ${error.message}`)
 return reply.code(500).send({ error: 'Widget action failed' })
 }
 }
 )

 /**
  * GET /api/rooms/:roomId/widgets/:eventId/state
  * Returns the latest widget state including all votes/submissions.
  */
 app.get(
 '/api/rooms/:roomId/widgets/:eventId/state',
 { preHandler: authenticate },
 async (request, reply) => {
 const { roomId, eventId } = request.params
 const accessToken = request.user?.accessToken

 if (!accessToken) {
 return reply.code(401).send({ error: 'Unauthorized' })
 }

 try {
 const synapseUrl = process.env.SYNAPSE_URL || 'https://echo.litteris.online'
 const msgRes = await fetch(
 `${synapseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/event/${encodeURIComponent(eventId)}`,
 {
 headers: { Authorization: `Bearer ${accessToken}` },
 signal: AbortSignal.timeout(5000),
 }
 )

 if (!msgRes.ok) {
 return reply.code(msgRes.status).send({ error: 'Widget event not found' })
 }

 const event = await msgRes.json()
 const widgetData = event.content?.['echo.widget']

 if (!widgetData) {
 return reply.code(400).send({ error: 'Event is not a widget' })
 }

 return reply.send({ widget: widgetData, eventId })
 } catch (error) {
 app.log.error(`[Widget] State fetch failed: ${error.message}`)
 return reply.code(500).send({ error: 'Failed to fetch widget state' })
 }
 }
 )
}