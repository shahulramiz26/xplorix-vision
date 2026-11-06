'use client'

import { useMemo, useState } from 'react'
import { MAINTENANCE_TYPE_LABEL, type MaintenanceLog } from '../../../lib/costing-store'
import { T, Page, Head, Card, Btn, Modal, Note, Empty, Table, th, thR, td, tdR, rowLine } from '../../components/kit'
import { MaintenanceLogForm } from '../../components/maintenance-log-form'
import { shortDay } from '../../admin/contractors/shared'
import { useMe, NoLogin, CLIENT_NAME } from '../me'

/* ==========================================================================
 * MAINTENANCE LOG — the contractor's repairs and services on his rigs
 *
 * Recorded so the client can see why a rig was down and for how long. The
 * cost of the repair and the parts are the contractor's own and are not asked
 * for. A breakdown is the contractor's own time and is not paid.
 * ========================================================================== */

export default function ContractorMaintenancePage() {
  const { state, me, user, side, scopes, saveMaintenance, deleteMaintenance } = useMe()
  const [editing, setEditing] = useState<MaintenanceLog | 'new' | null>(null)
  const ids = useMemo(() => new Set(side.orders.map(w => w.id)), [side.orders])
  const rows = useMemo(() => state.maintenance.filter(m => m.contractor === me?.id || (m.workOrderId && ids.has(m.workOrderId))).sort((a, b) => b.date.localeCompare(a.date)), [state.maintenance, me?.id, ids])

  if (!me || !user) return <NoLogin />

  return (
    <Page>
      <Head title="Maintenance log" sub={<>Repairs and services on your rigs while they work for {CLIENT_NAME}. They see the hours and what was done, not what it cost you.</>}
        right={<Btn kind="primary" disabled={!scopes.length} onClick={() => setEditing('new')}>New maintenance log</Btn>} />

      {scopes.length === 0 && <Note tone="warn">You are not on a running work order, so there is no rig to log against.</Note>}

      <Card title={`Your maintenance logs · ${rows.length}`} pad={false}>
        {rows.length === 0 ? <Empty>No maintenance logged yet.</Empty> : (
          <Table>
            <thead><tr><th style={th}>Date</th><th style={th}>Shift</th><th style={th}>Rig</th><th style={th}>Type</th><th style={th}>Component</th><th style={thR}>Hours</th><th style={th}>Action taken</th><th style={th} /></tr></thead>
            <tbody>
              {rows.map(m => (
                <tr key={m.id} className="xpl-row" style={{ borderBottom: rowLine }}>
                  <td style={{ ...td, color: T.text, fontWeight: 600 }}>{shortDay(m.date)}</td>
                  <td style={td}>{m.shift ?? '—'}</td><td style={td}>{m.rig}</td>
                  <td style={td}>{MAINTENANCE_TYPE_LABEL[m.maintenanceType]}</td>
                  <td style={{ ...td, whiteSpace: 'normal' }}>{m.component}</td>
                  <td style={tdR}>{m.hours} h</td><td style={td}>{m.action}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <Btn size="sm" onClick={() => setEditing(m)}>Change</Btn>
                      <Btn size="sm" kind="danger" onClick={() => deleteMaintenance(m.id)}>Remove</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {editing && (
        <Modal title={editing === 'new' ? 'Create Maintenance Log' : 'Edit Maintenance Log'} width={880} onClose={() => setEditing(null)}>
          <MaintenanceLogForm variant="contractor" scopes={scopes} existing={editing === 'new' ? undefined : editing} contractorId={me.id}
            by={user.name} submitLabel={editing === 'new' ? 'Create Log' : 'Save Changes'} onCancel={() => setEditing(null)}
            onSubmit={m => { saveMaintenance(m); setEditing(null) }} />
        </Modal>
      )}
    </Page>
  )
}
