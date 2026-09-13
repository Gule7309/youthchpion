import { useState } from 'react'
import { Icon, type IconName } from './Icon'
import { annualChange, snapshot } from './verifiedSnapshot'
import { changeClass } from './AnnualChange'
import './landing.css'

const steps: { name: string; icon: IconName; text: string }[] = [
  { name: '指標', icon: 'formula', text: '查看指標怎麼計算、用了哪些資料。' },
  { name: '排名', icon: 'chart', text: '比較各職業的求才變化。風險分數尚待核定。' },
  { name: '診斷', icon: 'sparkles', text: '了解判讀理由，以及目前還不能下的結論。' },
  { name: '論證', icon: 'book', text: '核對資料與研究原文，確認能支持哪些判斷。' },
  { name: '政策', icon: 'report', text: '查看政策依據，把已有資料整理成會議草稿。' },
]
function EnterLink() { return <a className="landing-cta" href="#indicators">查看職業分析<Icon name="arrow" /></a> }

export function LandingPage() {
  const [code, setCode] = useState<string>(snapshot.occupations[0].code)
  const occupation = snapshot.occupations.find(o => o.code === code)!
  const change = annualChange(occupation.previous, occupation.current)!
  return <div className="landing">
    <a className="landing-skip" href="#home-main">跳至主要內容</a>
    <header className="landing-header">
      <a className="landing-brand" href="#home" aria-label="rescueBill 首頁"><span><Icon name="logo" /></span>rescueBill</a>
      <nav aria-label="首頁導覽"><a href="#home-flow">如何使用</a><a href="#home-trust">資料與限制</a><EnterLink /></nav>
    </header>
    <main className="landing-main" id="home-main">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-intro">
          <p className="landing-audience"><Icon name="users" />給青年政策與就業服務工作者</p>
          <p className="landing-tagline">拯救 Bill，也拯救你的 bill。</p>
          <h1 id="landing-title" tabIndex={-1}>Bill 畢業了，<br />第一份工作在哪？</h1>
          <p className="landing-lead">如果 AI 改變了企業的用人需求，剛畢業的青年該怎麼辦？rescueBill 關心他們找工作的困難，也關心收入還沒穩定時，每個月要付的帳單。</p>
          <div className="landing-actions"><EnterLink /><a href="#home-flow">先了解使用流程</a></div>
          <p className="landing-caption">直接開啟展示版，不用註冊，也不用上傳資料。</p>
        </div>
        <div className="landing-preview">
          <div className="landing-folder-tab"><Icon name="briefcase" />職業觀察檔案</div>
          <section className="landing-folder" aria-label="真實資料互動預覽">
            <div className="landing-preview-heading"><span>官方求才資料預覽</span><span>2024–2025</span></div>
            <label className="landing-select">選擇職業<select value={code} onChange={e => setCode(e.target.value)}>{snapshot.occupations.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}</select></label>
            <div className="landing-observation" aria-live="polite" aria-atomic="true"><h2>{occupation.name}</h2><p>新登記求才人次年變化</p><strong className={changeClass(change)}>{change > 0 ? '+' : ''}{(change * 100).toFixed(2)}<span>%</span></strong>
              <div className="landing-bars">{([{ year: '2024', value: occupation.previous }, { year: '2025', value: occupation.current }]).map(row => <div key={row.year}><span>{row.year}</span><div className="landing-bar-track"><i style={{ width: `${row.value / Math.max(occupation.previous, occupation.current) * 100}%` }} /></div><b>{row.value.toLocaleString('zh-TW')}</b></div>)}</div>
            </div>
            <p className="landing-data-note"><Icon name="info" />這是全年齡的求才人次，不是青年失業率。光看增減，無法判斷是否與 AI 有關。</p>
            <a className="landing-source" href={snapshot.source} target="_blank" rel="noreferrer">查看勞動部原始資料集<Icon name="external" /></a>
          </section>
          <p className="landing-preview-foot">來源核對日期：{snapshot.checkedAt}。目前顯示已保存的資料，非即時更新。</p>
        </div>
      </section>
      <section className="landing-purpose" aria-labelledby="story-title">
        <h2 id="story-title">工作還在找，<br />帳單不會等。</h2>
        <div>
          <p>Bill 是我們其中一位剛畢業的組員。我們借用他的名字，設定了這個求職故事：當 AI 改變企業的用人需求，Bill 找第一份工作也受到影響。</p>
          <p>英文的 bill 是帳單。工作還在找，生活開銷卻不會暫停。rescueBill 的名字，就是想幫像 Bill 這樣的青年找到出路，也減輕他們付帳單的壓力。</p>
          <p>這是題目的故事設定，不是下方數據對 Bill 個人求職經歷的判定。</p>
        </div>
      </section>
      <section className="landing-purpose" aria-labelledby="purpose-title"><h2 id="purpose-title">政策能怎麼幫 Bill？<br />先把資料看清楚。</h2><div><p>哪些職業的求才減少了？和 AI 有關，還是有其他原因？要討論培訓或就業支持，得先分清楚資料能回答什麼。</p><p>rescueBill 是給政策工作者使用的決策輔助工具。你可以按職業查看求才變化、核對來源，再把已有內容整理成會議草稿。它不是求職媒合或代付帳單的服務；具體政策仍需要足夠的證據與人工評估。</p></div></section>
      <section className="landing-flow" id="home-flow" aria-labelledby="flow-title"><div className="landing-section-heading"><h2 id="flow-title">進入後，可以看這五個分頁。</h2><p>點上方導覽列或側邊檔案夾切換，從你需要的內容開始看。</p></div><ol>{steps.map((step, i) => <li key={step.name}><span className="landing-step-number">0{i + 1}</span><Icon name={step.icon} /><h3>{step.name}</h3><p>{step.text}</p></li>)}</ol></section>
      <section className="landing-trust" id="home-trust" aria-labelledby="trust-title"><div><Icon name="book" /><h2 id="trust-title">使用前，先了解<br />這份資料的限制。</h2><p>缺少的數值與政策依據會標示為待補，不會用示意資料代替。頁面引用的機構沒有因此為 rescueBill 背書。</p></div><dl>
        <div><dt>現在能用哪些功能？</dt><dd>查看三個職業的官方求才趨勢與判讀說明，也可以把已有內容整理成會議草稿。草稿由瀏覽器整理，不是 AI 生成的政策建議。</dd></div>
        <div><dt>哪些還沒完成？</dt><dd>完整的 AI 風險指標、各職業的政策依據與 AI 報告服務仍在建置。風險分數（Risk）尚未核定，目前不評分、不排名。</dd></div>
        <div><dt>這是 18–35 歲的資料嗎？</dt><dd>不是。18–35 歲是模型預計分析的族群，目前預覽的求才資料涵蓋全年齡，不能當成這個年齡層的就業結果。</dd></div>
      </dl></section>
      <section className="landing-bottom"><div><h2>先選一個職業，看看求才變化。</h2><p>進入後可以切換職業，查看數據與來源。</p></div><EnterLink /></section>
    </main>
    <footer className="landing-footer"><span>rescueBill 青年 AI 就業風險政策系統</span><span>政策決策輔助展示版，不取代專業判斷。</span></footer>
  </div>
}
