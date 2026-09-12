import { useLayoutEffect, useState } from 'react'
import { analysisKey, policyIssues, type Analysis, type MeetingDraft } from './decisionModel'

/** Session-only selection; never migrate a choice to another analysis version. */
export function useDecisionMeeting(analysis: Analysis) {
  const key = analysisKey(analysis)
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [preview, setDraft] = useState<MeetingDraft | null>(null)
  const sameOccupation = preview?.analysis.occupation.code === analysis.occupation.code
    && preview.analysis.occupation.classificationVersion === analysis.occupation.classificationVersion
  useLayoutEffect(() => { if (preview && !sameOccupation) setDraft(null) }, [preview, sameOccupation])
  return {
    selected: selections[key] ?? [], draft: sameOccupation ? preview : null, setDraft,
    togglePolicy(id: string) {
      const option = analysis.policies.find(p => p.id === id)
      if (!option || policyIssues(analysis, option).length) return
      setSelections(prior => {
        const chosen = prior[key] ?? []
        return { ...prior, [key]: chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id] }
      })
    },
  }
}
