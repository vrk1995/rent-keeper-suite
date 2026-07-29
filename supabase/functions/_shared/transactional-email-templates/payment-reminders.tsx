/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface PaymentItem {
  tenantName: string
  propertyName: string
  unitLabel?: string
  amount: number
  dueDate: string
  daysOverdue?: number
  daysUntilDue?: number
  invoiceNumber?: string
}

interface Props {
  recipientName?: string
  workspaceName?: string
  overdue?: PaymentItem[]
  upcoming?: PaymentItem[]
}

const formatINR = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

const formatDate = (iso: string) => {
  try {
    const [y, m, d] = iso.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    return dt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
  } catch {
    return iso
  }
}

const Row = ({ item, kind }: { item: PaymentItem; kind: 'overdue' | 'upcoming' }) => (
  <Section style={rowCard}>
    <Text style={rowTitle}>
      {item.tenantName} · <span style={rowMuted}>{item.propertyName}
      {item.unitLabel ? ` — ${item.unitLabel}` : ''}</span>
    </Text>
    <Text style={rowMeta}>
      {item.invoiceNumber ? <>Invoice {item.invoiceNumber} · </> : null}
      Due {formatDate(item.dueDate)}
      {kind === 'overdue' && item.daysOverdue
        ? ` · ${item.daysOverdue} day${item.daysOverdue === 1 ? '' : 's'} overdue`
        : ''}
      {kind === 'upcoming' && item.daysUntilDue !== undefined
        ? ` · due in ${item.daysUntilDue} day${item.daysUntilDue === 1 ? '' : 's'}`
        : ''}
    </Text>
    <Text style={rowAmount}>{formatINR(item.amount)}</Text>
  </Section>
)

const Email = ({
  recipientName,
  workspaceName = 'Rent Keeper',
  overdue = [],
  upcoming = [],
}: Props) => {
  const overdueTotal = overdue.reduce((s, i) => s + Number(i.amount || 0), 0)
  const upcomingTotal = upcoming.reduce((s, i) => s + Number(i.amount || 0), 0)

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {overdue.length > 0
          ? `${overdue.length} overdue payment${overdue.length === 1 ? '' : 's'} need attention`
          : `${upcoming.length} rent payment${upcoming.length === 1 ? '' : 's'} due soon`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={brandBar}>
            <Text style={brandMark}>RENT KEEPER</Text>
          </Section>

          <Section style={card}>
            <Text style={eyebrow}>Payment reminder</Text>
            <Heading style={h1}>
              {overdue.length > 0 ? 'Overdue payments need action' : 'Payments coming due'}
            </Heading>
            <Text style={lead}>
              {recipientName ? `Hi ${recipientName},` : 'Hello,'} here's a snapshot of rent
              collections for <strong>{workspaceName}</strong> that need your attention.
            </Text>

            {overdue.length > 0 && (
              <>
                <Text style={sectionHeader}>
                  Overdue ({overdue.length}) · {formatINR(overdueTotal)}
                </Text>
                {overdue.map((item, i) => (
                  <Row key={`o-${i}`} item={item} kind="overdue" />
                ))}
              </>
            )}

            {upcoming.length > 0 && (
              <>
                <Text style={sectionHeader}>
                  Due soon ({upcoming.length}) · {formatINR(upcomingTotal)}
                </Text>
                {upcoming.map((item, i) => (
                  <Row key={`u-${i}`} item={item} kind="upcoming" />
                ))}
              </>
            )}

            <Hr style={hr} />
            <Text style={footNote}>
              Log in to Rent Keeper to record payments, send receipts, or follow up with
              tenants. You're receiving this because you have access to these properties.
            </Text>
          </Section>

          <Text style={footer}>Rent Keeper · Property management, simplified</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (data: Props) => {
    const o = data.overdue?.length || 0
    const u = data.upcoming?.length || 0
    if (o > 0 && u > 0)
      return `${o} overdue and ${u} upcoming rent payment${o + u === 1 ? '' : 's'}`
    if (o > 0) return `${o} overdue rent payment${o === 1 ? '' : 's'} need attention`
    return `${u} rent payment${u === 1 ? '' : 's'} due in the next 2 days`
  },
  displayName: 'Payment Reminders',
  previewData: {
    recipientName: 'Priya',
    workspaceName: 'Rambal Builders',
    overdue: [
      {
        tenantName: 'Rajesh Kumar',
        propertyName: 'Yuteeka',
        unitLabel: 'Unit 2A',
        amount: 45000,
        dueDate: '2026-07-25',
        daysOverdue: 4,
        invoiceNumber: 'INV-RB-26-011',
      },
    ],
    upcoming: [
      {
        tenantName: 'Anita Desai',
        propertyName: 'Yuteeka',
        unitLabel: 'Unit 3B',
        amount: 38000,
        dueDate: '2026-07-31',
        daysUntilDue: 2,
        invoiceNumber: 'INV-RB-26-012',
      },
    ],
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  margin: 0,
  padding: 0,
}
const container = { maxWidth: '560px', margin: '0 auto', padding: '32px 20px 48px' }
const brandBar = { textAlign: 'center' as const, marginBottom: '20px' }
const brandMark = {
  fontSize: '12px',
  letterSpacing: '4px',
  fontWeight: 700,
  color: '#0f172a',
  margin: 0,
}
const card = {
  backgroundColor: '#ffffff',
  border: '1px solid #e6e8ec',
  borderRadius: '14px',
  padding: '32px 28px',
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
}
const eyebrow = {
  fontSize: '12px',
  letterSpacing: '2px',
  textTransform: 'uppercase' as const,
  color: '#0891b2',
  fontWeight: 600,
  margin: '0 0 8px',
}
const h1 = {
  fontSize: '24px',
  lineHeight: '30px',
  color: '#0f172a',
  fontWeight: 700,
  margin: '0 0 14px',
}
const lead = {
  fontSize: '15px',
  lineHeight: '24px',
  color: '#334155',
  margin: '0 0 20px',
}
const sectionHeader = {
  fontSize: '13px',
  letterSpacing: '1px',
  textTransform: 'uppercase' as const,
  color: '#0f172a',
  fontWeight: 700,
  margin: '22px 0 10px',
}
const rowCard = {
  border: '1px solid #eef1f5',
  borderRadius: '10px',
  padding: '12px 14px',
  margin: '0 0 8px',
}
const rowTitle = {
  fontSize: '14px',
  color: '#0f172a',
  fontWeight: 600,
  margin: '0 0 2px',
}
const rowMuted = { color: '#64748b', fontWeight: 400 }
const rowMeta = { fontSize: '12px', color: '#64748b', margin: '0 0 4px' }
const rowAmount = {
  fontSize: '15px',
  color: '#0f172a',
  fontWeight: 700,
  margin: 0,
}
const hr = { borderColor: '#e6e8ec', margin: '24px 0 16px' }
const footNote = {
  fontSize: '12px',
  lineHeight: '18px',
  color: '#94a3b8',
  margin: 0,
}
const footer = {
  fontSize: '11px',
  color: '#94a3b8',
  textAlign: 'center' as const,
  marginTop: '20px',
}
