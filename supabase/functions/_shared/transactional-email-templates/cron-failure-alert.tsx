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

interface FailureItem {
  label: string
  message: string
}

interface Props {
  cronName: string
  ranAt: string
  topLevelError?: string | null
  items?: FailureItem[]
}

const formatRanAt = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    }) + ' IST'
  } catch {
    return iso
  }
}

const Email = ({ cronName, ranAt, topLevelError, items = [] }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{cronName} failed — {topLevelError ? 'crashed' : `${items.length} item${items.length === 1 ? '' : 's'} failed`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={brandMark}>RENT KEEPER</Text>
        </Section>

        <Section style={card}>
          <Text style={eyebrow}>Scheduled job failed</Text>
          <Heading style={h1}>{cronName}</Heading>
          <Text style={lead}>Ran at {formatRanAt(ranAt)}.</Text>

          {topLevelError && (
            <>
              <Text style={sectionHeader}>Crashed before finishing</Text>
              <Section style={rowCard}>
                <Text style={rowMeta}>{topLevelError}</Text>
              </Section>
            </>
          )}

          {items.length > 0 && (
            <>
              <Text style={sectionHeader}>
                {items.length} item{items.length === 1 ? '' : 's'} failed
              </Text>
              {items.map((item, i) => (
                <Section key={i} style={rowCard}>
                  <Text style={rowTitle}>{item.label}</Text>
                  <Text style={rowMeta}>{item.message}</Text>
                </Section>
              ))}
            </>
          )}

          <Hr style={hr} />
          <Text style={footNote}>
            Nothing else was skipped silently — anything not listed above completed normally.
          </Text>
        </Section>

        <Text style={footer}>Rent Keeper · Property management, simplified</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  to: 'vrk1995@gmail.com',
  subject: (data: Props) => `⚠️ ${data.cronName} failed`,
  displayName: 'Cron Failure Alert',
  previewData: {
    cronName: 'Daily Invoice Generation',
    ranAt: new Date().toISOString(),
    topLevelError: null,
    items: [
      { label: 'Rambal Yuteeka', message: 'generate-invoice-pdf failed: Payment not found' },
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
  color: '#dc2626',
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
  border: '1px solid #fecaca',
  backgroundColor: '#fef2f2',
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
const rowMeta = { fontSize: '12px', color: '#7f1d1d', margin: 0 }
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
