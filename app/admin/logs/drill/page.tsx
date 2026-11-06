'use client'

import { ADMIN_NAME } from '../../../../lib/costing-store'
import { DrillLogsScreen } from '../../../components/log-screens'
import { DeptInbox } from '../../../components/inbox'

export default function AdminDrillLogs() {
  return <DrillLogsScreen who={ADMIN_NAME} top={<DeptInbox depts={['data', 'crew', 'safety']} name="Drill logs" />} />
}
