/// <reference types="npm:@types/react@18.3.1" />
import type { ComponentType } from 'npm:react@18.3.1'
import { template as teamInvite } from './team-invite.tsx'
import { template as paymentReminders } from './payment-reminders.tsx'
import { template as cronFailureAlert } from './cron-failure-alert.tsx'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: any) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'team-invite': teamInvite,
  'payment-reminders': paymentReminders,
  'cron-failure-alert': cronFailureAlert,
}
