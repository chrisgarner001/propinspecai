import { describe, expect, it } from 'vitest'
import { nextRoomName, customRoomName, isGuidedInspectionRequired, ROOM_PRESETS } from './roomPlan'

const preset = (name: string) => ROOM_PRESETS.find((p) => p.name === name)!

describe('nextRoomName', () => {
  it('always numbers bedrooms and bathrooms, continuing from the highest number', () => {
    expect(nextRoomName([], preset('Bedroom'))).toBe('Bedroom 1')
    expect(nextRoomName(['Bedroom 1', 'Kitchen'], preset('Bedroom'))).toBe('Bedroom 2')
    // A removed middle room doesn't get its number reused (no two "Bedroom 3"s in one video).
    expect(nextRoomName(['Bedroom 1', 'Bedroom 3'], preset('Bedroom'))).toBe('Bedroom 4')
    expect(nextRoomName(['Bedroom 1'], preset('Bathroom'))).toBe('Bathroom 1')
  })

  it('uses the plain name for a single room, then numbers a second one', () => {
    expect(nextRoomName([], preset('Living Room'))).toBe('Living Room')
    expect(nextRoomName(['living room'], preset('Living Room'))).toBe('Living Room 2')
    expect(nextRoomName(['Living Room', 'Living Room 2'], preset('Living Room'))).toBe('Living Room 3')
  })
})

describe('customRoomName', () => {
  it('tidies spacing and rejects blanks and duplicates', () => {
    expect(customRoomName([], '  Bonus   Room ')).toBe('Bonus Room')
    expect(customRoomName(['Bonus Room'], 'bonus room')).toBeNull()
    expect(customRoomName([], '   ')).toBeNull()
  })
})

describe('isGuidedInspectionRequired', () => {
  it('requires both the master switch and the inspection type switch', () => {
    expect(isGuidedInspectionRequired(true, true)).toBe(true)
    expect(isGuidedInspectionRequired(true, false)).toBe(false)
    expect(isGuidedInspectionRequired(false, true)).toBe(false)
  })
})
