import 'server-only'
import { Resend } from 'resend'

const FROM_ADDRESS = 'PropInspec <info@propmind.ai>'

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
