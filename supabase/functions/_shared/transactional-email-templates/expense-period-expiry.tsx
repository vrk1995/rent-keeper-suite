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

interface ExpenseItem {
  title: string
  propertyName: string
  category?: string
  periodTo: string
  daysUntilExpiry?: number
  daysOverdue?: number
}

interface Props {
  recipientName?: string
  workspaceName?: string
  expiringSoon?: ExpenseItem[]
  overdue?: ExpenseItem[]
}

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

const Row = ({ item, kind }: { item: ExpenseItem; kind: 'overdue' | 'expiring' }) => (
  <Section style={rowCard}>
    <Text style={rowTitle}>
      {item.title} · <span style={rowMuted}>{item.propertyName}</span>
    </Text>
    <Text style={rowMeta}>
      {item.category ? `${item.category} · ` : ''}
      Coverage ends {formatDate(item.periodTo)}
      {kind === 'overdue' && item.daysOverdue !== undefined
        ? ` · expired ${item.daysOverdue} day${item.daysOverdue === 1 ? '' : 's'} ago`
        : ''}
      {kind === 'expiring' && item.daysUntilExpiry !== undefined
        ? item.daysUntilExpiry === 0
          ? ' · expires today'
          : ` · expires in ${item.daysUntilExpiry} day${item.daysUntilExpiry === 1 ? '' : 's'}`
        : ''}
    </Text>
  </Section>
)

const Email = ({
  recipientName,
  workspaceName = 'Rent Keeper',
  expiringSoon = [],
  overdue = [],
}: Props) => {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {overdue.length > 0
          ? `${overdue.length} expense${overdue.length === 1 ? '' : 's'} past their coverage period`
          : `${expiringSoon.length} expense${expiringSoon.length === 1 ? '' : 's'} expiring soon`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={brandBar}>
            <Text style={brandMark}>RENT KEEPER</Text>
          </Section>

          <Section style={card}>
            <Text style={eyebrow}>Coverage period alert</Text>
            <Heading style={h1}>
              {overdue.length > 0 ? 'Coverage has lapsed' : 'Coverage expiring soon'}
            </Heading>
            <Text style={lead}>
              {recipientName ? `Hi ${recipientName},` : 'Hello,'} these expenses in{' '}
              <strong>{workspaceName}</strong> have a coverage period (insurance, tax, AMC,
              etc.) that needs attention.
            </Text>

            {overdue.length > 0 && (
              <>
                <Text style={sectionHeader}>Expired ({overdue.length})</Text>
                {overdue.map((item, i) => (
                  <Row key={`o-${i}`} item={item} kind="overdue" />
                ))}
              </>
            )}

            {expiringSoon.length > 0 && (
              <>
                <Text style={sectionHeader}>Expiring soon ({expiringSoon.length})</Text>
                {expiringSoon.map((item, i) => (
                  <Row key={`e-${i}`} item={item} kind="expiring" />
                ))}
              </>
            )}

            <Hr style={hr} />
            <Text style={footNote}>
              Log in to Rent Keeper and open the expense to renew it or update its coverage
              period. You're receiving this because you have access to these properties.
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
    const e = data.expiringSoon?.length || 0
    const o = data.overdue?.length || 0
    if (o > 0 && e > 0)
      return `${o} expired and ${e} expiring soon — coverage period alert`
    if (o > 0) return `${o} expense${o === 1 ? '' : 's'} past their coverage period`
    return `${e} expense${e === 1 ? '' : 's'} expiring soon`
  },
  displayName: 'Expense Coverage Period Expiry',
  previewData: {
    recipientName: 'Priya',
    workspaceName: 'Rambal Builders',
    overdue: [
      {
        title: 'Fire insurance',
        propertyName: 'Yuteeka',
        category: 'insurance',
        periodTo: '2026-07-20',
        daysOverdue: 5,
      },
    ],
    expiringSoon: [
      {
        title: 'Property tax',
        propertyName: 'Sreepadam',
        category: 'taxes',
        periodTo: '2026-08-31',
        daysUntilExpiry: 15,
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
