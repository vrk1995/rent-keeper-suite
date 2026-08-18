import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { notifyCronFailure } from '../_shared/notifyCronFailure.ts'

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

// Days-before-expiry checkpoints that fire once each (tracked per-expense in
// expiry_alerts_sent so a renewed period restarts the cycle). Once past expiry, the alert
// repeats every OVERDUE_REPEAT_DAYS indefinitely until the user updates the coverage period.
const THRESHOLDS = [30, 15, 7, 3, 1, 0]
const OVERDUE_REPEAT_DAYS = 7

function istToday(): string {
  const d = new Date(Date.now() + IST_OFFSET_MS)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function daysBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number)
  const [ty, tm, td] = toISO.split('-').map(Number)
  const a = Date.UTC(fy, fm - 1, fd)
  const b = Date.UTC(ty, tm - 1, td)
  return Math.round((b - a) / 86400000)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const today = istToday()
  const summary: any[] = []

  try {
    // 1. Every expense with a coverage period set.
    const { data: expenses, error: expError } = await supabase
      .from('property_expenses')
      .select('id, workspace_id, property_id, title, category, period_to, expiry_alerts_sent')
      .not('period_to', 'is', null)

    if (expError) throw expError

    // 2. Figure out which expenses have something to say today: a not-yet-notified
    //    pre-expiry threshold has been crossed, or it's overdue on a repeat-notify day.
    const triggered: {
      expense: NonNullable<typeof expenses>[number]
      daysUntilExpiry: number
      newThresholds: string[]
    }[] = []

    for (const exp of expenses || []) {
      const diff = daysBetween(today, exp.period_to as string) // negative => already expired
      const alreadySent = new Set((exp.expiry_alerts_sent as string[]) || [])
      const newThresholds = THRESHOLDS.filter((t) => diff <= t && !alreadySent.has(String(t))).map(String)
      const isOverdueRepeat = diff < 0 && Math.abs(diff) % OVERDUE_REPEAT_DAYS === 0

      if (newThresholds.length === 0 && !isOverdueRepeat) continue
      triggered.push({ expense: exp, daysUntilExpiry: diff, newThresholds })
    }

    if (triggered.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, note: 'nothing expiring' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Persist newly-crossed thresholds so tomorrow's run doesn't re-notify them. The
    //    post-expiry repeat isn't tracked here — the modulo check above is naturally
    //    periodic, so there's nothing to persist for it.
    for (const t of triggered) {
      if (t.newThresholds.length === 0) continue
      const merged = Array.from(new Set([...((t.expense.expiry_alerts_sent as string[]) || []), ...t.newThresholds]))
      const { error: updateError } = await supabase
        .from('property_expenses')
        .update({ expiry_alerts_sent: merged })
        .eq('id', t.expense.id)
      if (updateError) console.error('Failed to persist expiry_alerts_sent for', t.expense.id, updateError)
    }

    // 4. Supporting data + recipients (mirrors send-payment-reminders' access resolution).
    const propIds = [...new Set(triggered.map((t) => t.expense.property_id))]
    const workspaceIds = [...new Set(triggered.map((t) => t.expense.workspace_id))]

    const { data: props } = await supabase.from('properties').select('id, name').in('id', propIds)
    const propMap = new Map((props || []).map((p: any) => [p.id, p]))

    const { data: roles, error: rErr } = await supabase
      .from('user_roles')
      .select('user_id, role, workspace_id')
      .in('workspace_id', workspaceIds)
      .in('role', ['admin', 'member', 'super_admin'])
    if (rErr) throw rErr

    const { data: access } = await supabase
      .from('user_property_access')
      .select('user_id, property_id, workspace_id')
      .in('workspace_id', workspaceIds)

    // Keyed by (user, workspace): a user restricted in one workspace must stay unrestricted
    // in another, matching has_property_access()'s per-workspace rule.
    const restrictKey = (userId: string, workspaceId: string) => `${userId}|${workspaceId}`
    const restrictedProps = new Map<string, Set<string>>()
    for (const a of access || []) {
      const key = restrictKey(a.user_id, a.workspace_id)
      if (!restrictedProps.has(key)) restrictedProps.set(key, new Set())
      restrictedProps.get(key)!.add(a.property_id)
    }

    const { data: workspaces } = await supabase.from('workspaces').select('id, name').in('id', workspaceIds)
    const wsMap = new Map((workspaces || []).map((w: any) => [w.id, w.name]))

    const userIds = [...new Set((roles || []).map((r: any) => r.user_id))]
    const emailMap = new Map<string, string>()
    for (const uid of userIds) {
      const { data: u } = await supabase.auth.admin.getUserById(uid as string)
      if (u?.user?.email) emailMap.set(uid as string, u.user.email)
    }
    const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', userIds)
    const nameMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]))

    let sent = 0
    const reminderRows: any[] = []

    // 5. One consolidated email + a set of in-app reminders per recipient.
    for (const role of roles || []) {
      const email = emailMap.get(role.user_id)
      if (!email) continue

      const restrict = role.role === 'super_admin'
        ? undefined
        : restrictedProps.get(restrictKey(role.user_id, role.workspace_id))

      const userItems = triggered.filter((t) => {
        if (t.expense.workspace_id !== role.workspace_id) return false
        if (restrict && restrict.size > 0 && !restrict.has(t.expense.property_id)) return false
        return true
      })
      if (userItems.length === 0) continue

      const expiringSoon: any[] = []
      const overdue: any[] = []
      for (const t of userItems) {
        const prop = propMap.get(t.expense.property_id) as any
        const propertyName = prop?.name || 'Property'
        const item = {
          title: t.expense.title,
          propertyName,
          category: t.expense.category || undefined,
          periodTo: t.expense.period_to,
        }
        if (t.daysUntilExpiry < 0) {
          overdue.push({ ...item, daysOverdue: Math.abs(t.daysUntilExpiry) })
        } else {
          expiringSoon.push({ ...item, daysUntilExpiry: t.daysUntilExpiry })
        }

        reminderRows.push({
          user_id: role.user_id,
          workspace_id: role.workspace_id,
          property_id: t.expense.property_id,
          expense_id: t.expense.id,
          title:
            t.daysUntilExpiry < 0
              ? `${t.expense.title} coverage has expired`
              : `${t.expense.title} coverage expires ${
                  t.daysUntilExpiry === 0 ? 'today' : `in ${t.daysUntilExpiry} day${t.daysUntilExpiry === 1 ? '' : 's'}`
                }`,
          description: `${propertyName} · coverage period ends ${t.expense.period_to}.`,
          reminder_date: today,
          reminder_type: 'expense_expiry',
          is_completed: false,
        })
      }

      // Idempotency: one email per user per day.
      const idempotencyKey = `expense-expiry-${role.user_id}-${today}`

      const { error: sendErr } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'expense-period-expiry',
          recipientEmail: email,
          idempotencyKey,
          templateData: {
            recipientName: nameMap.get(role.user_id) || undefined,
            workspaceName: wsMap.get(role.workspace_id) || 'Rent Keeper',
            expiringSoon,
            overdue,
          },
        },
      })
      if (sendErr) {
        console.error('send failed', role.user_id, sendErr)
        summary.push({ user_id: role.user_id, error: String(sendErr) })
      } else {
        sent++
        summary.push({ user_id: role.user_id, expiringSoon: expiringSoon.length, overdue: overdue.length })
      }
    }

    if (reminderRows.length > 0) {
      const { error: reminderError } = await supabase.from('reminders').insert(reminderRows)
      if (reminderError) console.error('Failed to create expense-expiry reminders:', reminderError)
    }

    const failed = summary.filter((s) => s.error)
    if (failed.length > 0) {
      await notifyCronFailure(supabase, {
        cronName: 'Check Expense Expiries',
        ranAtIso: new Date().toISOString(),
        items: failed.map((s) => ({
          label: nameMap.get(s.user_id) || s.user_id,
          message: String(s.error),
        })),
      })
    }

    return new Response(
      JSON.stringify({ success: true, sent, checked: triggered.length, summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('check-expense-expiries failed', err)
    await notifyCronFailure(supabase, {
      cronName: 'Check Expense Expiries',
      ranAtIso: new Date().toISOString(),
      topLevelError: (err as Error).message,
    })
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
