'use client'

import { useSignedIn } from '../../../lib/session'
import { DrillLogsScreen } from '../../components/log-screens'

/* The supervisor's own drill logs, and the form to write the next one. */
export default function SupervisorDrillLog() {
  const { user } = useSignedIn('supervisor')
  if (!user) return null
  return <DrillLogsScreen who={user.name} supervisor={user.name} />
}
