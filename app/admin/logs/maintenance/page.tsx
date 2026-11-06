'use client'

import { ADMIN_NAME } from '../../../../lib/costing-store'
import { MaintenanceLogsScreen } from '../../../components/log-screens'
import { DeptInbox } from '../../../components/inbox'

export default function AdminMaintenanceLogs() {
  return <MaintenanceLogsScreen who={ADMIN_NAME} top={<DeptInbox depts={['maintenance']} name="Maintenance" />} />
}
