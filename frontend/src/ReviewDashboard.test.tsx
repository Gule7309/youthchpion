import { expect, it } from 'vitest'
import { snapshot } from './verifiedSnapshot'

it('保留已核對快照與三個職業，不以 UI 更新冒充資料更新', () => {
  expect(snapshot.checkedAt).toBe('2026-09-12')
  expect(snapshot.occupations.map(o => o.code)).toEqual(['4', '2', '5'])
})
