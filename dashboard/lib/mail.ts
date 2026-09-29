import 'server-only'
import { Resend } from 'resend'

// TEMPORARY (2026-09-29): propmind.ai isn't verified on Resend yet (confirmed
// via a real 403 send failure), so this uses Resend's shared sandbox sender
// until Chris verifies the domain at resend.com/domains. resend.dev's sandbox
// address only delivers to the email on the Resend account itself -- it will
// NOT reach a real new user's inbox, so createUser is still effectively
// broken for anyone but that one account until propmind.ai is verified and
// this reverts to 'PropInspec <info@propmind.ai>'.
const FROM_ADDRESS = 'PropInspec <onboarding@resend.dev>'

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set')
  }
  return new Resend(apiKey)
}

// New Manage Users accounts get a random temp password (never chosen by the
// admin who creates them) -- this is the only way the new user learns it.
// Failure here is surfaced to the caller (createUser) rather than swallowed:
// silently "succeeding" at creating an account nobody can ever log into
// would be worse than the create failing outright.
export async function sendTempPasswordEmail(email: string, tempPassword: string): Promise<void> {
  const resend = getResend()
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: 'Your PropInspec account',
    text: `An account was created for you on PropInspec (GPM Property Management's move-out inspection dashboard).\n\nTemporary password: ${tempPassword}\n\nSign in at the usual PropInspec link and you'll be asked to set your own password before doing anything else.\n\nIf you weren't expecting this, let Chris know.`,
  })
  if (error) {
    throw new Error(`Failed to send account email: ${error.message}`)
  }
}
