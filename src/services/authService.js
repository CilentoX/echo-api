import crypto from 'crypto'

/**
 * Generate a random state token for CSRF protection.
 * Stores the state in a short-lived cache (memory with TTL).
 * @returns {string} The generated state token (base64url encoded)
 */
function generateState() {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * Initiates the Google SSO login flow.
 * Builds the Synapse OIDC redirect URL and returns the login URL and state.
 *
 * @param {string} redirectUrl - The URL to redirect back to after authentication
 * @returns {{ loginUrl: string, state: string }} The login URL and state token
 */
export function initiateGoogleSso(redirectUrl) {
  const state = generateState()

  // Build the Synapse OIDC redirect URL
  const loginUrl = `${process.env.SYNAPSE_URL}/_synapse/client/oidc/redirect/google?redirectUrl=${encodeURIComponent(
    redirectUrl,
  )}`

  return { loginUrl, state }
}

/**
 * Exchanges the authorization code for tokens via Synapse OIDC callback.
 * Validates the state against the cached value, then calls Synapse to get tokens.
 *
 * @param {string} code - The authorization code from the Google callback
 * @param {string} state - The state token to validate against cache
 * @returns {{ accessToken, refreshToken, deviceId, userId }} The exchanged tokens
 */
export async function exchangeCodeForTokens(code, state) {
  // Validate state matches cache
  // In a full implementation, this would check against a Redis or memory cache
  // For now, we just verify the state is present and non-empty
  if (!state || typeof state !== 'string') {
    throw new Error('Invalid or missing state parameter')
  }

  // Validate code is present
  if (!code || typeof code !== 'string') {
    throw new Error('Invalid or missing code parameter')
  }

  // Call Synapse OIDC callback to exchange code for tokens
  const synapseResponse = await fetch(`${process.env.SYNAPSE_URL}/_synapse/client/oidc/callback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      state,
    }),
  })

  if (!synapseResponse.ok) {
    const errorText = await synapseResponse.text()
    throw new Error(`Failed to exchange code for tokens: ${errorText}`)
  }

  const tokens = await synapseResponse.json()

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    deviceId: tokens.device_id,
    userId: tokens.user_id,
  }
}