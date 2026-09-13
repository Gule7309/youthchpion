import { useLayoutEffect, useState } from 'react'
import { analysisKey, policyIssues, type Analysis, type MeetingDraft } from './decisionModel'

/** Session-only selection; a choice never migrates to another analysis version. */
export function useDecisionMeeting(analysis: Analysis | null) {
  const key = analysis ? analysisKey(analysis) : ''
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [preview, setDraft] = useState<MeetingDraft | null>(null)
  const sameOccupation = Boolean(analysis && preview
    && preview.analysis.occupation.code === analysis.occupation.code
    && preview.analysis.occupation.classificationVersion === analysis.occupation.classificationVersion)

  useLayoutEffect(() => {
    if (preview && !sameOccupation) setDraft(null)
  }, [preview, sameOccupation])

  return {
    selected: key ? selections[key] ?? [] : [],
    draft: sameOccupation ? preview : null,
    setDraft,
    togglePolicy(id: string) {
      if (!analysis) return
      const option = analysis.policies.find((item) => item.id === id)
      if (!option || policyIssues(analysis, option).length) return
      setSelections((prior) => {
        const chosen = prior[key] ?? []
        return {
          ...prior,
          [key]: chosen.includes(id)
            ? chosen.filter((item) => item !== id)
            : [...chosen, id],
        }
      })
    },
  }
}
