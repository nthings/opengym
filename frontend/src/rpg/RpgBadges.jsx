import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import { Section, Row } from '../components/ui.jsx'
import { rpgState } from './xp.js'
import { badgeCopy } from './copy.js'

// The RPG badges (module `rpg`, /rpg/badges): one row each, earned ones checked, locked ones with
// how far you are. Reached from the sheet (rpg/RpgSheet.jsx).
export default function RpgBadges() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const today = todayISO()
  const sheet = useMemo(() => rpgState(S, today), [S.workouts, S.weekStart, S.streakRule, S.recoverySessions, S.recoveryStreak, S.activities, S.activityStreak, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const names = badgeCopy()
  const earned = sheet.badges.filter(b => b.earned).length

  return <div className="narrow rpg">
    <div className="hdr">
      <button className="iconbtn" data-back="/rpg" onClick={() => nav('/rpg')} aria-label={t('RPG')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Badges')}</h1>
        <div className="sub">{earned} / {sheet.badges.length}</div></div>
    </div>
    <Section>
      {sheet.badges.map(b => <Row key={b.id} icon={b.earned ? 'medal' : 'lock'} iconTint={b.earned ? 'var(--yellow)' : 'var(--grey)'}
        className={b.earned ? 'rpg-badge-on' : ''} title={names[b.id]}
        subtitle={b.earned ? null : Math.min(b.have, b.need) + ' / ' + b.need} accessory={b.earned ? 'check' : 'none'} />)}
    </Section>
  </div>
}
