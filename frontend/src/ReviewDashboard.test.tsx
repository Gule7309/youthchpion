import { describe, expect, it } from 'vitest'
import { annualChange, snapshot } from './verifiedSnapshot'

describe('teammate reviewed snapshot helpers', () => {
  it('preserves the reviewed Ministry of Labor values and safe annual-change rules', () => {
    expect(
      snapshot.occupations.map((occupation) =>
        Number((annualChange(occupation.previous, occupation.current)! * 100).toFixed(2)),
      ),
    ).toEqual([-14.03, 2.65, -8.01])
    expect(annualChange(100, 100)).toBe(0)
    expect(annualChange(100, 0)).toBe(-1)
    expect(annualChange(0, 100)).toBeNull()
    expect(annualChange(null, 100)).toBeNull()
    expect(annualChange(100, null)).toBeNull()
    expect(annualChange(Number.NaN, 10)).toBeNull()
    expect(annualChange(10, Number.POSITIVE_INFINITY)).toBeNull()
  })
})
