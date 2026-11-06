'use client'

import { useState } from 'react'
import { api } from '../../lib/backend'
import { T, Btn, Field, Modal, Note, inputStyle } from './kit'

/* ==========================================================================
 * CHANGE YOUR OWN PASSWORD
 *
 * Every login is first given a password by someone else: the Company Admin,
 * or the XPLORIX owner for a new company. This is how its owner makes it
 * theirs. The current password is asked for, so a phone left unlocked is not
 * enough to take a login over.
 * ========================================================================== */

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const [f, setF] = useState({ current: '', next: '', again: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const ok = f.current.length > 0 && f.next.length >= 8 && f.next === f.again

  const save = async () => {
    setError(''); setBusy(true)
    try {
      const r = await api<{ error?: string }>('/api/auth/password', { method: 'POST', body: { current: f.current, next: f.next } })
      if (r.ok) { setDone(true); setF({ current: '', next: '', again: '' }); onDone?.() }
      else setError(r.data?.error ?? 'The password could not be changed.')
    } catch { setError('No connection. Check the network and try again.') }
    setBusy(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
      <Field label="Your current password"><input type="password" autoComplete="current-password" value={f.current} onChange={e => { setF({ ...f, current: e.target.value }); setDone(false) }} style={inputStyle} /></Field>
      <Field label="New password" hint="At least 8 characters."><input type="password" autoComplete="new-password" value={f.next} onChange={e => { setF({ ...f, next: e.target.value }); setDone(false) }} style={inputStyle} /></Field>
      <Field label="New password again" hint={f.again && f.next !== f.again ? 'The two are not the same.' : undefined}><input type="password" autoComplete="new-password" value={f.again} onChange={e => setF({ ...f, again: e.target.value })} style={inputStyle} /></Field>
      {error && <Note tone="bad">{error}</Note>}
      {done && <Note tone="good"><b style={{ color: T.text }}>Password changed.</b> Use the new one next time you sign in.</Note>}
      <div><Btn kind="primary" disabled={!ok || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Change password'}</Btn></div>
    </div>
  )
}

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Change your password" subtitle="It is yours alone. Nobody at XPLORIX or in your company can read it." width={480} onClose={onClose}>
      <ChangePasswordForm />
    </Modal>
  )
}
