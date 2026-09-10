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
    scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'],
  })
}

// The two Shared Drives GPM's property folders live in, split alphabetically
// by street name for size (see DESIGN.md Decisions Log). Looked up by name
// each call rather than hardcoding ids -- cheap (2 results) and avoids a
// fragile hardcoded id.
export async function findPropertyFolder(streetName: string, streetNumber: string) {
  const auth = getGoogleAuth()
  const drive = google.drive({ version: 'v3', auth })

  const { data } = await drive.drives.list({ pageSize: 20 })
  const propertyDrives = (data.drives ?? []).filter((d) => d.name?.startsWith('Property Files'))

  for (const propDrive of propertyDrives) {
    const res = await drive.files.list({
      q: `mimeType = 'application/vnd.google-apps.folder' and name contains '${streetName.replace(/'/g, "\\'")}'`,
      corpora: 'drive',
      driveId: propDrive.id!,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'files(id, name)',
    })
    const match = (res.data.files ?? []).find((f) => f.name?.includes(streetNumber))
    if (match) return { folderId: match.id!, folderName: match.name!, driveName: propDrive.name! }
  }

  return null
}

// "1554 Brest, Lincoln Park, MI" -> { number: "1554", streetName: "Brest" }
export function parseStreetAddress(propertyAddress: string) {
  const streetPart = propertyAddress.split(',')[0].trim()
  const match = streetPart.match(/^(\d+)\s+(.+)$/)
  if (!match) return null
  return { number: match[1], streetName: match[2].trim() }
}
