import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { copyText } from '../lib/clipboard.js'
import Icon from '../components/Icon.jsx'
import { Section, Row, Button, TextField } from '../components/ui.jsx'
import { confirmSheet } from '../sheets.jsx'
import { rankBoard } from './board.js'

// RPG friends (module `rpg`, /rpg/friends): invite links and the friends list. The server side is
// api/rpg/ (stage A: keys and invites; nothing about training moves yet).

// Written inside t() so check-source-strings finds them; the server's own words are never shown.
// api() hangs the server's answer on the error as `data` (lib/api.js), not as `code`.
const errorText = e => {
  const code = e?.data?.code || e?.code
  return code === 'invite-invalid' ? t('That invite was already used or has expired.')
    : code === 'self' ? t('That invite is yours. Send it to a friend.')
      : code === 'bad-link' || code === 'bad-address' ? t('That is not a valid invite link.')
        : t('Could not reach that server.')
}
const hostOf = url => { try { return new URL(url).host } catch { return url } }

export default function Friends() {
  const nav = useNavigate()
  const [on, setOn] = useState(null) // null while loading
  const [friends, setFriends] = useState([])
  const [invite, setInvite] = useState(null)
  const [copied, setCopied] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [board, setBoard] = useState(null)
  const weekStart = useStore(s => s.S.weekStart)
  const ranking = useMemo(() => rankBoard(board, undefined, { weekStart }), [board, weekStart])

  const load = useCallback(async () => {
    try {
      const s = await api('/api/rpg/status')
      setOn(!!s.on)
      if (s.on) {
        const list = (await api('/api/rpg/friends')).friends || []
        setFriends(list)
        // The ranking is a bonus: a failure here must not hide the friends list.
        setBoard(list.length ? await api('/api/rpg/board').catch(() => null) : null)
      }
    } catch (e) { setOn(false); setError(errorText(e)) }
  }, [])
  useEffect(() => { load() }, [load])

  const makeInvite = async () => {
    setError(''); setCopied(false)
    try { setInvite((await api('/api/rpg/invite', { method: 'POST', body: '{}' })).link) } catch (e) { setError(errorText(e)) }
  }
  const copy = async () => { if (await copyText(invite)) setCopied(true) }
  const add = async () => {
    setError(''); setBusy(true)
    try {
      await api('/api/rpg/add', { method: 'POST', body: JSON.stringify({ link: text.trim() }) })
      setText('')
      await load()
    } catch (e) { setError(errorText(e)) }
    setBusy(false)
  }
  const remove = f => confirmSheet({
    title: t('Remove friend'), message: t('Remove {0} from your friends?', f.name || hostOf(f.serverUrl)),
    confirmText: t('Remove'), danger: true,
    onConfirm: async () => { try { await api('/api/rpg/remove', { method: 'POST', body: JSON.stringify({ id: f.id }) }); await load() } catch (e) { setError(errorText(e)) } },
  })

  return <div className="narrow rpg">
    <div className="hdr">
      <button className="iconbtn" data-back="/rpg" onClick={() => nav('/rpg')} aria-label={t('RPG')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Friends')}</h1></div>
    </div>

    {on === false && <div className="card muted">{t('Friends need a server with RPG switched on (RPG=on).')}</div>}

    {on && <>
      {ranking.length > 1 && <Section title={t('This week')} footer={t('Counts the last 7 days. Workouts logged late or edited afterwards do not count.')}>
        {ranking.map(r => <Row key={r.id} className="rpg-rank" icon={r.rank === 1 ? 'medal' : 'person'} iconTint={r.rank === 1 ? 'var(--yellow)' : 'var(--teal)'}
          title={(r.rank ? r.rank + '. ' : '') + (r.me ? t('You') : r.name)}
          subtitle={r.broken ? t('History does not add up') : r.error ? t('Could not update') : r.streak > 0 ? t('Streak') + ': ' + r.streak : null}
          value={r.broken ? null : t('{0} XP', r.weekXp)} />)}
      </Section>}
      <Section title={t('Friends')}>
        {friends.length === 0 && <div className="card muted">{t('No friends yet.')}</div>}
        {friends.map(f => <Row key={f.id} icon="person" iconTint="var(--teal)" title={f.name || hostOf(f.serverUrl)} subtitle={hostOf(f.serverUrl)}>
          <Button variant="ghost" style={{ marginInlineStart: 'auto' }} onClick={() => remove(f)}>{t('Remove')}</Button>
        </Row>)}
      </Section>

      <Section title={t('Invite a friend')} footer={invite ? t('Valid for 48 hours and works once. Your friend pastes it under Friends, Add a friend.') : null}>
        <div className="card">
          {!invite && <Button variant="primary" onClick={makeInvite}>{t('Invite a friend')}</Button>}
          {invite && <>
            <TextField readOnly value={invite} aria-label={t('Invite a friend')} onFocus={e => e.target.select()} />
            <div style={{ height: 8 }} />
            <Button variant="primary" onClick={copy}>{t('Copy link')}</Button>
            {copied && <div className="muted small" style={{ marginTop: 6 }}>{t('Link copied')}</div>}
          </>}
        </div>
      </Section>

      <Section title={t('Add a friend')}>
        <div className="card">
          <TextField value={text} placeholder={t('Paste an invite link')} aria-label={t('Paste an invite link')} onChange={e => setText(e.target.value)} />
          <div style={{ height: 8 }} />
          <Button variant="primary" disabled={busy || !text.trim()} onClick={add}>{t('Add a friend')}</Button>
        </div>
      </Section>
    </>}

    {error && <div className="card" role="alert" style={{ color: 'var(--red)' }}>{error}</div>}
  </div>
}
