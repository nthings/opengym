import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, tn } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import { Section } from '../components/ui.jsx'
import { rpgState } from './xp.js'
import { titleCopy, attributeCopy, badgeCopy } from './copy.js'

// The RPG character sheet (module `rpg`, Settings → Modules → RPG). Everything shown is read back
// from the workouts by rpg/xp.js; nothing is stored. Styles are inline so the module adds no CSS to
// the core stylesheet.

const bar = (pct, tint) => (
  <div style={{ height: 8, borderRadius: 4, background: 'var(--fill, rgba(127,127,127,.2))', overflow: 'hidden' }}>
    <div style={{ width: Math.max(0, Math.min(100, pct)) + '%', height: '100%', background: tint }} />
  </div>
)

export default function RpgSheet() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const today = todayISO()
  // Same inputs the streak card on Home reads (views/Home.jsx), plus the workouts themselves.
  const sheet = useMemo(() => rpgState(S, today), [S.workouts, S.weekStart, S.streakRule, S.recoverySessions, S.recoveryStreak, S.activities, S.activityStreak, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const titles = titleCopy(), attrs = attributeCopy(), badges = badgeCopy()
  const top = Math.max(1, ...sheet.attributes.map(a => a.value))

  return <div className="narrow rpg">
    <div className="hdr">
      <button className="iconbtn" data-back="/settings" onClick={() => nav('/settings')} aria-label={t('Settings')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('RPG')}</h1>
        <div className="sub">{tn('{0} workout', '{0} workouts', sheet.stats.workouts)}</div></div>
    </div>

    <div className="card" style={{ textAlign: 'center' }}>
      <div className="muted small">{titles[sheet.title]}</div>
      <div style={{ fontSize: 34, fontWeight: 700, margin: '4px 0' }}>{t('Level {0}', sheet.level)}</div>
      {bar((sheet.into / sheet.span) * 100, 'var(--purple)')}
      <div className="muted small" style={{ marginTop: 8 }}>{t('{0} XP', sheet.xp)}</div>
      <div className="muted small">{t('{0} XP to level {1}', sheet.toNext, sheet.level + 1)}</div>
    </div>

    <Section title={t('Attributes')}>
      <div className="card">
        {sheet.attributes.map(a => <div key={a.id} className="rpg-attr" style={{ margin: '6px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{attrs[a.id]}</span><span className="muted">{a.value}</span>
          </div>
          {bar((a.value / top) * 100, 'var(--teal)')}
        </div>)}
      </div>
    </Section>

    <Section title={t('Badges')}>
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {sheet.badges.map(b => <span key={b.id} className="chip rpg-badge" data-earned={b.earned ? 'true' : 'false'}
          style={{ opacity: b.earned ? 1 : 0.4 }}>
          <Icon name={b.earned ? 'medal' : 'lock'} />{badges[b.id]}
        </span>)}
      </div>
    </Section>
  </div>
}
