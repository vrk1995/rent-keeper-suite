/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  inviteeName?: string
  inviterName?: string
  workspaceName?: string
  role?: string
  inviteLink?: string
  expiresInDays?: number
}

const roleLabel = (role?: string) => {
  switch (role) {
    case 'admin':
      return 'Admin'
    case 'viewer':
      return 'Viewer'
    default:
      return 'Team Member'
  }
}

const Email = ({
  inviteeName,
  inviterName = 'Your admin',
  workspaceName = 'Rent Keeper',
  role,
  inviteLink = '#',
  expiresInDays = 14,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {inviterName} invited you to join {workspaceName} on Rent Keeper
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={brandMark}>RENT KEEPER</Text>
        </Section>

        <Section style={card}>
          <Text style={eyebrow}>You're invited</Text>
          <Heading style={h1}>
            Join {workspaceName}
          </Heading>
          <Text style={lead}>
            {inviteeName ? `Hi ${inviteeName},` : 'Hello,'} {inviterName} has
            invited you to collaborate on <strong>{workspaceName}</strong> as a{' '}
            <strong>{roleLabel(role)}</strong>.
          </Text>

          <Section style={ctaWrap}>
            <Button style={button} href={inviteLink}>
              Accept invitation
            </Button>
          </Section>

          <Text style={muted}>
            This invitation link is unique to you and expires in{' '}
            {expiresInDays} days. If the button doesn't work, copy and paste
            this link into your browser:
          </Text>
          <Text style={linkFallback}>
            <Link href={inviteLink} style={linkStyle}>
              {inviteLink}
            </Link>
          </Text>

          <Hr style={hr} />

          <Text style={footNote}>
            If you weren't expecting this invitation, you can safely ignore
            this email — no account will be created.
          </Text>
        </Section>

        <Text style={footer}>
          Rent Keeper · Property management, simplified
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Props) =>
    `${data.inviterName || 'Your admin'} invited you to ${data.workspaceName || 'Rent Keeper'}`,
  displayName: 'Team Invitation',
  previewData: {
    inviteeName: 'Priya',
    inviterName: 'Vishnu Kumar',
    workspaceName: 'Rambal Builders',
    role: 'member',
    inviteLink: 'https://terntripsindia.in/#/invite-signup?invite=preview',
    expiresInDays: 14,
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  margin: 0,
  padding: 0,
}

const container = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '32px 20px 48px',
}

const brandBar = {
  textAlign: 'center' as const,
  marginBottom: '20px',
}

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
  padding: '36px 32px',
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
  fontSize: '26px',
  lineHeight: '32px',
  color: '#0f172a',
  fontWeight: 700,
  margin: '0 0 16px',
}

const lead = {
  fontSize: '15px',
  lineHeight: '24px',
  color: '#334155',
  margin: '0 0 24px',
}

const ctaWrap = {
  textAlign: 'center' as const,
  margin: '8px 0 20px',
}

const button = {
  backgroundColor: '#0f172a',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
  padding: '14px 28px',
  borderRadius: '10px',
  display: 'inline-block',
}

const muted = {
  fontSize: '13px',
  lineHeight: '20px',
  color: '#64748b',
  margin: '20px 0 6px',
}

const linkFallback = {
  fontSize: '12px',
  lineHeight: '18px',
  wordBreak: 'break-all' as const,
  margin: '0 0 8px',
}

const linkStyle = {
  color: '#0891b2',
  textDecoration: 'underline',
}

const hr = {
  borderColor: '#e6e8ec',
  margin: '24px 0 16px',
}

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
