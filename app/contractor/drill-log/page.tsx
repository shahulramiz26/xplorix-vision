'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { uid, nowStamp, type ShiftName } from '../../../lib/costing-store'
import { draftToReport, reportToDraft } from '../../../lib/contracting'
import { when } from '../../../lib/projects'
import { T, Page, Head, Card, Note, Empty } from '../../components/kit'
import { DrillLogForm } from '../../components/drill-log-form'
import { shortDay } from '../../admin/contractors/shared'
import { useMe, NoLogin, CLIENT_NAME } from '../me'

/* ==========================================================================
 * DRILL LOG — the contractor writes his own shift and sends it
 *
 * The same drill log form the client's own supervisors use, without the two
 * sections that are about the client's stock (bit usage and accessories),
 * and with fuel left optional: those are the contractor's own business.
 *
 * Nothing is uploaded and nobody on the client's side types it again. The
 * shift waits for the client's site staff to check it; only a checked shift
 * is paid. A shift that came back is corrected here and sent again.
 * ========================================================================== */

function DrillLogScreen() {
  const { me, user, side, scopes, saveReport } = useMe()
  const params = useSearchParams()
  const fixId = params.get('fix')
  const fixing = fixId ? side.returned.find(r => r.id === fixId) : undefined
  const [sent, setSent] = useState<string | null>(null)
  const [round, setRound] = useState(0)

  if (!me || !user) return <NoLogin />
  if (scopes.length === 0) {
    return <Page><Head title="Drill log" /><Card><Empty>You are not on a running work order with {CLIENT_NAME}, so there is no shift to enter.</Empty></Card></Page>
  }
  const start = { rig: params.get('rig') ?? undefined, date: params.get('date') ?? undefined, shift: (params.get('shift') as ShiftName | null) ?? undefined,
    project: scopes.find(s => s.rigs.includes(params.get('rig') ?? ''))?.project }

  return (
    <Page>
      <Head title={fixing ? 'Correct a shift and send it again' : 'Drill log'}
        sub={<>Enter the shift once and send it to {CLIENT_NAME}. They check it against what they see on site. Only a checked shift is paid.</>} />

      {sent && (
        <Note tone="good">
          <b style={{ color: T.text }}>Sent to {CLIENT_NAME}.</b> {sent}. It is waiting to be checked.{' '}
          <Link href="/contractor/logs" style={{ color: T.orange, fontWeight: 600, textDecoration: 'none' }}>Open submitted logs</Link>
        </Note>
      )}

      <div style={{ maxWidth: 1000 }}>
        <DrillLogForm key={`${fixing?.id ?? 'new'}_${round}`} variant="contractor" scopes={scopes}
          existing={fixing ? reportToDraft(fixing) : undefined} skipReportId={fixing?.id} start={start}
          by={user.name} submitLabel={fixing ? 'Send the corrected shift' : `Send to ${CLIENT_NAME}`}
          top={fixing ? (
            <Note tone="bad">
              <b style={{ color: T.text }}>{CLIENT_NAME} sent this shift back.</b> {fixing.returnReason}
              <div style={{ fontSize: 12, color: T.faint, marginTop: 3 }}>{fixing.returnedBy}{fixing.returnedAt ? ` · ${when(fixing.returnedAt)}` : ''} · you had sent {fixing.metres} m</div>
            </Note>
          ) : undefined}
          onSubmit={log => {
            const wo = side.orders.find(w => w.status === 'active' && w.project === log.project && w.rigs.includes(log.rig))
            if (!wo) return
            saveReport(draftToReport(log, wo, fixing?.id ?? uid('rp'), nowStamp()))
            setSent(`${log.shift} shift on ${log.rig}, ${shortDay(log.date)}: ${log.standbyMode ? 'standby' : log.metresDrilled > 0 ? `${log.metresDrilled} m on ${log.holeNumber}` : 'no metres'}`)
            setRound(n => n + 1)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }} />
      </div>
    </Page>
  )
}

export default function DrillLogPage() {
  return <Suspense fallback={null}><DrillLogScreen /></Suspense>
}
