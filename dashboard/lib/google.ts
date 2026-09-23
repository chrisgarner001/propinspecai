import { google } from 'googleapis'

// Service account credentials come from an env var (GOOGLE_SERVICE_ACCOUNT_JSON),
// same pattern as DATABASE_URL -- works identically in local dev and on Vercel.
// Never read from the local google-service-account.json file directly: that
// file isn't deployed (gitignored, same as other secrets).
function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set')
  }
  return JSON.parse(raw)
}

export function getGoogleAuth() {
  return new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
}

// "https://drive.google.com/drive/folders/10nhel1iO..." -> "10nhel1iO..."
export function parseFolderIdFromUrl(url: string): string | null {
  const match = url.match(/folders\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

export async function listVideosInFolder(folderId: string) {
  const auth = getGoogleAuth()
  const drive = google.drive({ version: 'v3', auth })

  // Drive's files.list silently returns an empty result when the caller
  // (the service account) can't see the parent folder at all -- it does not
  // throw. Confirmed with a real call: a folder never shared with the
  // service account returned files.list => [] while files.get on that same
  // folder id threw a real 404 "File not found." Without this explicit
  // check, an unshared folder is indistinguishable from a genuinely empty
  // one, and the caller (syncInspectionVideos) surfaces the misleading
  // "No video files found" instead of the real, actionable problem.
  try {
    await drive.files.get({ fileId: folderId, supportsAllDrives: true, fields: 'id' })
  } catch {
    const { client_email } = getCredentials()
    throw new Error(
      `Can't access this Drive folder -- make sure it's shared with ${client_email} (Viewer access is enough).`
    )
  }

  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: 'files(id, name, mimeType)',
  })
  return (res.data.files ?? []) as { id: string; name: string; mimeType: string }[]
}

export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const auth = getGoogleAuth()
  const drive = google.drive({ version: 'v3', auth })
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  )
  return Buffer.from(res.data as ArrayBuffer)
}
