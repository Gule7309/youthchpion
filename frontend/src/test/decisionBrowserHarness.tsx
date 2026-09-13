// Browser-only QA entry. Not imported by the app, and excluded from its bundle.
import { createRoot } from 'react-dom/client'
import { FolderWorkspace } from '../FolderWorkspace'
import { PolicyMeeting, type DecisionFlow } from '../DecisionPanels'
import { useDecisionMeeting } from '../useDecisionMeeting'
import { decisionFixture } from './decisionFixtures'
// Use the application's already-loaded stylesheet order, not a second theme import.

const analysis = decisionFixture(4)
analysis.limitations.push('測試長中文段落與換頁。'.repeat(90))
analysis.evidence[0].url = `https://example.org/TEST-ONLY/${'long-source-locator-'.repeat(15)}`
function Harness() {
  const meeting = useDecisionMeeting(analysis)
  const flow: DecisionFlow = { analysis, ...meeting, navigate: () => undefined, openEvidence: () => undefined }
  return <div className="folder-app policy-dashboard"><header><h1>僅限互動驗收：合成政策資料，不得對外展示</h1></header><FolderWorkspace contextKey="isolated-test" blocked={false} onExternalNavigate={() => undefined} renderPage={index => index === 4 ? <section className="panel policy-report"><PolicyMeeting flow={flow} /></section> : <p>僅測試報告頁</p>} /></div>
}
export function mountDecisionHarness() {
  document.title = 'TEST ONLY / 政策互動驗收'
  window.history.replaceState(null, '', '#report')
  const host = document.createElement('div'); host.id = 'root'
  document.body.replaceChildren(host)
  createRoot(host).render(<Harness />)
}
