// Room-plan naming for the Guided Inspection field view. The names produced
// here become the ONLY room names the AI extraction may use for that
// inspection (lib/gemini.ts), so they follow the same rule the prompt
// enforces: rooms a house can have several of are always numbered ("Bedroom
// 1", "Bedroom 2"), never a bare "Bedroom" that could later be confused with
// one of them (the 9355 Sylvia seam bug).

export type RoomPreset = { name: string; numbered: boolean }

export const ROOM_PRESETS: RoomPreset[] = [
  { name: 'Bedroom', numbered: true },
  { name: 'Bathroom', numbered: true },
  { name: 'Living Room', numbered: false },
  { name: 'Kitchen', numbered: false },
  { name: 'Dining Room', numbered: false },
  { name: 'Family Room', numbered: false },
  { name: 'Hallway', numbered: false },
  { name: 'Entryway', numbered: false },
  { name: 'Laundry Room', numbered: false },
  { name: 'Utility Room', numbered: false },
  { name: 'Basement', numbered: false },
  { name: 'Attic', numbered: false },
  { name: 'Garage', numbered: false },
  { name: 'Exterior', numbered: false },
]

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ')

function highestNumber(existing: string[], base: string): number {
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`, 'i')
  return existing.reduce((max, name) => {
    const m = normalize(name).match(re)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
}

// Next name for a preset tap: numbered presets always get a number; single
// rooms get the plain name first, then "Living Room 2" if added again.
export function nextRoomName(existing: string[], preset: RoomPreset): string {
  const base = preset.name
  const taken = new Set(existing.map((n) => normalize(n).toLowerCase()))
  if (preset.numbered) return `${base} ${highestNumber(existing, base) + 1}`
  if (!taken.has(base.toLowerCase())) return base
  return `${base} ${Math.max(highestNumber(existing, base), 1) + 1}`
}

// A typed custom name ("Bonus Room", "Half Bath"). Returns null when it
// would duplicate an existing room, so the caller can say so rather than
// silently creating "Bonus Room" twice.
export function customRoomName(existing: string[], raw: string): string | null {
  const name = normalize(raw)
  if (!name) return null
  const taken = new Set(existing.map((n) => normalize(n).toLowerCase()))
  return taken.has(name.toLowerCase()) ? null : name
}

// Guided inspection is enforced only when both System Config switches are on.
export function isGuidedInspectionRequired(masterOn: boolean, typeOn: boolean): boolean {
  return masterOn && typeOn
}
