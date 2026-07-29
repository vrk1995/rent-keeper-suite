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

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your Rent Keeper password</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={brandMark}>RENT KEEPER</Text>
        </Section>

        <Section style={card}>
          <Text style={eyebrow}>Password reset</Text>
          <Heading style={h1}>Reset your password</Heading>
          <Text style={lead}>
            We received a request to reset the password for your{' '}
            <strong>{siteName}</strong> account. Click the button below to
            choose a new one.
          </Text>

          <Section style={ctaWrap}>
            <Button style={button} href={confirmationUrl}>
              Reset password
            </Button>
          </Section>

          <Text style={muted}>
            This link expires in 1 hour and can only be used once. If the
            button doesn't work, copy and paste this link into your browser:
          </Text>
          <Text style={linkFallback}>
            <Link href={confirmationUrl} style={linkStyle}>
              {confirmationUrl}
            </Link>
          </Text>

          <Hr style={hr} />
          <Text style={footNote}>
            If you didn't request a password reset, you can safely ignore this
            email — your password will not be changed.
          </Text>
        </Section>

        <Text style={footer}>Rent Keeper · Property management, simplified</Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

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
const ctaWrap = { textAlign: 'center' as const, margin: '8px 0 20px' }
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
const muted = { fontSize: '13px', lineHeight: '20px', color: '#64748b', margin: '20px 0 6px' }
const linkFallback = { fontSize: '12px', lineHeight: '18px', wordBreak: 'break-all' as const, margin: '0 0 8px' }
const linkStyle = { color: '#0891b2', textDecoration: 'underline' }
const hr = { borderColor: '#e6e8ec', margin: '24px 0 16px' }
const footNote = { fontSize: '12px', lineHeight: '18px', color: '#94a3b8', margin: 0 }
const footer = { fontSize: '11px', color: '#94a3b8', textAlign: 'center' as const, marginTop: '20px' }
