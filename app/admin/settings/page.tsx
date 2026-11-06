'use client'

import { useState } from 'react'
import { Page, Head, Card, Btn, Field, Switch, Split, inputStyle, T } from '../../components/kit'
import { ThemeChoice } from '../../components/theme'
import { ChangePasswordForm } from '../../components/change-password'
import { useSession } from '../../../lib/backend'
import { COMPANY_NAME, COMPANY_CODE, IS_DEMO } from '../../../lib/company'

/* SETTINGS — company details and the few rules that apply everywhere.
 * One Save button for the whole screen, and it says so when it has saved. */

const START = {
  company: 'Apex Drilling Solutions', email: 'admin@apexdrilling.com', phone: '+966 11 465 2290',
  shiftHours: '12', overlapWarning: true,
  alertMaintenance: true, dailySummary: true, billingNotices: false, incidentReports: true,
  passwordPolicy: 'standard', rotatePasswords: true, twoFactor: false,
}

/* With a database connected, Settings holds what is really kept: who you are
 * and your password. The rest of the old screen was a mock-up and is shown in
 * the browser demo only. */
function AccountSettings() {
  const session = useSession()
  if (session.status !== 'in') return null
  const u = session.user
  const row = (k: string, v: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: `1px solid ${T.line}`, fontSize: 13.5 }}>
      <span style={{ color: T.faint }}>{k}</span><span style={{ color: T.text, fontWeight: 600, textAlign: 'right' }}>{v}</span>
    </div>
  )
  return (
    <Page>
      <Head title="Settings" sub="Your login and your company." />
      <Split>
        <Card title="Company">
          {row('Company', COMPANY_NAME)}
          {row('Code used in usernames', COMPANY_CODE)}
          {row('Data', IS_DEMO ? 'Demo data, on a fixed date' : 'Your own records, on today’s date')}
          <div style={{ fontSize: 12.5, color: T.faint, marginTop: 12, lineHeight: 1.55 }}>To change the company name, ask XPLORIX.</div>
        </Card>
        <Card title="Your login">
          {row('Name', u.name)}
          {row('Username', u.username)}
          {row('Signs in as', 'Company Admin')}
        </Card>
      </Split>
      <Card title="Change your password" subtitle="If you were given this password by someone else, change it now.">
        <ChangePasswordForm />
      </Card>
      <Card title="Appearance" subtitle="Dark for the rig office at night, light for a bright room. Saved on this device.">
        <ThemeChoice />
      </Card>
    </Page>
  )
}

export default function SettingsPage() {
  const session = useSession()
  return session.status === 'in' ? <AccountSettings /> : <DemoSettings />
}

function DemoSettings() {
  const [saved, setSaved] = useState(START)
  const [s, setS] = useState(START)
  const [justSaved, setJustSaved] = useState(false)
  const dirty = JSON.stringify(s) !== JSON.stringify(saved)
  const set = <K extends keyof typeof START>(k: K, v: (typeof START)[K]) => { setS({ ...s, [k]: v }); setJustSaved(false) }
  const save = () => { setSaved(s); setJustSaved(true) }

  return (
    <Page>
      <Head title="Settings" sub="Company details and the rules that apply across every project."
        right={<>
          <span role="status" style={{ fontSize: 12.5, color: justSaved ? T.green : T.faint }}>
            {justSaved ? '✓ Settings saved' : dirty ? 'You have unsaved changes' : ''}
          </span>
          {dirty && <Btn onClick={() => setS(saved)}>Discard</Btn>}
          <Btn kind="primary" disabled={!dirty} onClick={save}>Save settings</Btn>
        </>} />

      <Split>
        <Card title="Company">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Company name"><input value={s.company} onChange={e => set('company', e.target.value)} style={inputStyle} /></Field>
            <Field label="Email" hint="Invoices and alerts from XPLORIX go here."><input type="email" value={s.email} onChange={e => set('email', e.target.value)} style={inputStyle} /></Field>
            <Field label="Phone"><input value={s.phone} onChange={e => set('phone', e.target.value)} style={inputStyle} /></Field>
          </div>
        </Card>

        <Card title="Shifts">
          <Field label="Default shift length" hint="A supervisor can still change it on a single shift log.">
            <select value={s.shiftHours} onChange={e => set('shiftHours', e.target.value)} style={inputStyle}>
              <option value="12">12 hours</option>
              <option value="10">10 hours</option>
              <option value="8">8 hours</option>
            </select>
          </Field>
          <div style={{ marginTop: 10 }}>
            <Switch on={s.overlapWarning} onChange={v => set('overlapWarning', v)} label="Warn when two shifts overlap"
              hint="Stops the same hours being logged twice on one rig." />
          </div>
        </Card>
      </Split>

      <Card title="Appearance" subtitle="Dark for the rig office at night, light for a bright room or a projector. Saved on this device as soon as you pick; the button beside the bell does the same.">
        <ThemeChoice />
      </Card>

      <Split>
        <Card title="Notifications" subtitle="What XPLORIX emails you about">
          <Switch on={s.alertMaintenance} onChange={v => set('alertMaintenance', v)} label="Maintenance due" />
          <Switch on={s.dailySummary} onChange={v => set('dailySummary', v)} label="Daily summary" hint="Metres, stoppages and stock problems, each morning." />
          <Switch on={s.incidentReports} onChange={v => set('incidentReports', v)} label="Safety incidents" hint="The moment a supervisor logs one." />
          <Switch on={s.billingNotices} onChange={v => set('billingNotices', v)} label="XPLORIX billing" />
        </Card>

        <Card title="Security">
          <Field label="Password rule">
            <select value={s.passwordPolicy} onChange={e => set('passwordPolicy', e.target.value)} style={inputStyle}>
              <option value="standard">Standard: 8 or more characters, a capital and a number</option>
              <option value="strong">Strong: 12 or more, with capitals, numbers and symbols</option>
            </select>
          </Field>
          <div style={{ marginTop: 10 }}>
            <Switch on={s.rotatePasswords} onChange={v => set('rotatePasswords', v)} label="Ask for a new password every 90 days" />
            <Switch on={s.twoFactor} onChange={v => set('twoFactor', v)} label="Two-step sign-in" hint="A code by SMS as well as the password." />
          </div>
        </Card>
      </Split>
    </Page>
  )
}
