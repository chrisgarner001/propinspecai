import { spawn } from 'node:child_process'
import type { Readable } from 'node:stream'
import ffmpegPath from 'ffmpeg-static'
import { getDriveAccessToken } from './google'

// In-app splitting of an oversized video, straight from Drive to Drive.
//
// scripts/split-video.mjs had to run on a PC because it downloads the whole
// video first, and Vercel's /tmp (~512MB) can't hold a 600MB+ phone video.
// This never writes the source to disk: ffmpeg reads it over HTTPS from the
// Drive API with the service account's token, using HTTP range requests to
// seek (verified 2026-10-01 against 35852 Beverly's 483MB 20260928_155719.mp4:
// duration probe ~1.8s, a 60s HEVC part cut cleanly), and each part is piped
// out as fragmented MP4 directly into the Drive upload -- same technique as
// the room clips (lib/stills.ts cutClipToStream).

// Same length as scripts/split-video.mjs's segments, so parts made either
// way are interchangeable for the processing pipeline.
export const SPLIT_SEGMENT_SECONDS = 180

export function splitPartCount(durationSeconds: number): number {
  return Math.max(1, Math.ceil(durationSeconds / SPLIT_SEGMENT_SECONDS))
}

// Matches scripts/split-video.mjs's naming (`<original>-part1.mp4`), which
// compareVideoFilenames (lib/rooms.ts) already sorts into recording order.
export function splitPartName(filename: string, index: number): string {
  return `${filename.replace(/\.[^.]+$/, '')}-part${index + 1}.mp4`
}

function driveMediaUrl(fileId: string) {
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`
}

function requireFfmpeg(): string {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path')
  return ffmpegPath
}

// `ffmpeg -i <url>` with no output exits non-zero by design and prints the
// container metadata (including Duration) to stderr -- same trick as
// lib/stills.ts getVideoCreationTime. Only the moov atom is fetched, via
// range requests, not the whole file.
export async function probeDriveVideoSeconds(fileId: string): Promise<number> {
  const token = await getDriveAccessToken()
  const stderr = await new Promise<string>((resolve, reject) => {
    const child = spawn(requireFfmpeg(), ['-hide_banner', '-headers', `Authorization: Bearer ${token}\r\n`, '-i', driveMediaUrl(fileId)], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let out = ''
    child.stderr.on('data', (d) => (out += d))
    child.on('error', reject)
    child.on('close', () => resolve(out))
  })
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!m) throw new Error(`Could not read the video's length from Drive: ${stderr.trim().split('\n').pop() ?? 'no output'}`)
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

// One part, streamed. `done` rejects if ffmpeg exits non-zero, so the caller
// can trash a truncated upload instead of keeping it.
export async function cutDriveVideoPartToStream(
  fileId: string,
  startSeconds: number,
  durationSeconds: number,
): Promise<{ stream: Readable; done: Promise<void> }> {
  const token = await getDriveAccessToken()
  const child = spawn(
    requireFfmpeg(),
    [
      '-hide_banner',
      '-loglevel', 'error',
      '-headers', `Authorization: Bearer ${token}\r\n`,
      '-ss', String(startSeconds),
      '-i', driveMediaUrl(fileId),
      '-t', String(durationSeconds),
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-movflags', 'frag_keyframe+empty_moov',
      '-f', 'mp4',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let stderr = ''
  child.stderr.on('data', (d) => {
    stderr = (stderr + d).slice(-2000)
  })
  const done = new Promise<void>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().split('\n').pop() ?? ''}`)),
    )
  })
  return { stream: child.stdout, done }
}
