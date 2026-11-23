import { useMemo } from 'react'
import { useStore } from '../store/useStore.js'
import { t, tn } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import { Section } from '../components/ui.jsx'
import { rpgState } from './xp.js'
import { titleCopy, attributeCopy, badgeCopy, sourceCopy } from './copy.js'

// The RPG character sheet (module `rpg`, Settings → Modules → RPG). Everything shown is read back
// from the workouts by rpg/xp.js; nothing is stored. Styles are inline so the module adds no CSS to
// the core stylesheet.

const bar = (pct, tint, data) => (
  <div data-pct={data == null ? undefined : Math.round(data)} style={{ height: 8, borderRadius: 4, background: 'var(--fill, rgba(127,127,127,.2))', overflow: 'hidden' }}>
    <div style={{ width: Math.max(0, Math.min(100, pct)) + '%', height: '100%', background: tint }} />
  </div>
)

export default function RpgSheet() {
  const S = useStore(s => s.S)
  const today = todayISO()
  // Same inputs the streak card on Home reads (views/Home.jsx), plus the workouts themselves.
  const sheet = useMemo(() => rpgState(S, today), [S.workouts, S.weekStart, S.streakRule, S.recoverySessions, S.recoveryStreak, S.activities, S.activityStreak, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const titles = titleCopy(), attrs = attributeCopy(), badges = badgeCopy(), sources = sourceCopy()

  return <div className="narrow rpg">
    <div className="hdr">
      <div style={{ flex: 1 }}><h1>{t('RPG')}</h1>
        <div className="sub">{tn('{0} workout', '{0} workouts', sheet.stats.workouts)}</div></div>
    </div>

    <div className="card" style={{ textAlign: 'center' }}>
      <div className="muted small">{titles[sheet.title]}</div>
      <div style={{ fontSize: 34, fontWeight: 700, margin: '4px 0' }}>{t('Level {0}', sheet.level)}</div>
      {bar((sheet.into / sheet.span) * 100, 'var(--purple)')}
      <div className="muted small" style={{ marginTop: 8 }}>{t('{0} XP', sheet.xp)}</div>
      <div className="muted small">{t('{0} XP to level {1}', sheet.toNext, sheet.level + 1)}</div>
      <div className="muted small" style={{ marginTop: 10, display: 'flex', justifyContent: 'space-around' }}>
        <span className="rpg-today">{t('Today')} +{t('{0} XP', sheet.recent.today)}</span>
        <span className="rpg-week">{t('This week')} +{t('{0} XP', sheet.recent.week)}</span>
      </div>
    </div>

    <Section title={t('Attributes')}>
      <div className="card">
        {sheet.attributes.map(a => <div key={a.id} className="rpg-attr" style={{ margin: '6px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{attrs[a.id]}</span><span className="muted">{t('Level {0}', a.level)} · {a.value}</span>
          </div>
          {bar((a.into / a.span) * 100, 'var(--teal)', (a.into / a.span) * 100)}
        </div>)}
      </div>
    </Section>

    <Section title={t('Where your XP comes from')}>
      <div className="card rpg-sources">
        {Object.keys(sheet.sources).map(k => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0' }}>
          <span>{sources[k]}</span><span className="muted">{t('{0} XP', sheet.sources[k])}</span>
        </div>)}
      </div>
    </Section>

    <Section title={t('Badges')} footer={sheet.nextBadge ? <span className="rpg-next">{t('Next badge')}: {badges[sheet.nextBadge.id]} ({sheet.nextBadge.have} / {sheet.nextBadge.need})</span> : null}>
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {sheet.badges.map(b => <span key={b.id} className="chip rpg-badge" data-earned={b.earned ? 'true' : 'false'}
          style={{ opacity: b.earned ? 1 : 0.4 }}>
          <Icon name={b.earned ? 'medal' : 'lock'} />{badges[b.id]}
        </span>)}
      </div>
    </Section>
  </div>
}
