'use client'

import { useSignedIn } from '../../../lib/session'
import { MaintenanceLogsScreen } from '../../components/log-screens'

/* The supervisor's own maintenance logs, and the form to write the next one. */
export default function SupervisorMaintenanceLog() {
  const { user } = useSignedIn('supervisor')
  if (!user) return null
  return <MaintenanceLogsScreen who={user.name} supervisor={user.name} />
}
