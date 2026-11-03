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
 * Builds the Synapse Matrix SSO redirect URL and returns the login URL and state.
 *
 * @param {string} redirectUrl - The URL to redirect back to after authentication
 * @param {string} [idpId='oidc-google'] - The identity provider ID on Synapse
 * @returns {{ loginUrl: string, state: string }} The login URL and state token
 */
export function initiateGoogleSso(redirectUrl, idpId = 'oidc-google') {
  const state = generateState()

  // Build the Synapse Matrix SSO redirect URL
  const provider = idpId || 'oidc-google'
  const loginUrl = `${process.env.SYNAPSE_URL}/_matrix/client/v3/login/sso/redirect/${provider}?redirectUrl=${encodeURIComponent(
    redirectUrl,
  )}`

  return { loginUrl, state }
}

/**
 * Exchanges the Matrix SSO loginToken for session tokens via Synapse m.login.token.
 *
 * @param {string} code - The login token from the Synapse redirect
 * @param {string} [state] - The optional state token
 * @param {object} [prisma] - The Prisma client instance
 * @returns {Promise<{ accessToken, refreshToken, deviceId, userId }>} The exchanged tokens
 */
export async function exchangeCodeForTokens(code, state, prisma = null) {
  // Validate state parameter
  if (!state || typeof state !== 'string') {
    throw new Error('Invalid or missing state parameter')
  }

  // Validate code/token is present
  if (!code || typeof code !== 'string') {
    throw new Error('Invalid or missing code parameter')
  }

  // Call Synapse /_matrix/client/v3/login to exchange token for access_token
  const synapseResponse = await fetch(`${process.env.SYNAPSE_URL}/_matrix/client/v3/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'm.login.token',
      token: code,
    }),
  })

  if (!synapseResponse.ok) {
    const errorText = await synapseResponse.text()
    throw new Error(`Failed to exchange code for tokens: ${errorText}`)
  }

  const tokens = await synapseResponse.json()

  const result = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || null,
    deviceId: tokens.device_id,
    userId: tokens.user_id,
  }

  if (prisma) {
    try {
      const { storeUserTokensDB } = await import('../lib/auth/tokenStore.js')
      await storeUserTokensDB(prisma, result.userId, result.accessToken, result.refreshToken, result.deviceId)
    } catch (err) {
      console.error('[authService] Error saving user token to DB:', err)
    }
  }

  return result
}