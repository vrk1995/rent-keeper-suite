import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { notifyCronFailure } from '../_shared/notifyCronFailure.ts'

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

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
    // 1. Load unpaid payments due today, in the next 2 days, or overdue.
    // We include statuses pending/partial/overdue, and any past-due unpaid row.
    const { data: payments, error: pErr } = await supabase
      .from('rent_payments')
      .select(
        'id, workspace_id, property_id, tenant_id, unit_id, amount, paid_amount, due_date, status'
      )
      .in('status', ['pending', 'partial', 'overdue'])

    if (pErr) throw pErr

    const relevant = (payments || []).filter((p) => {
      const outstanding = Number(p.amount || 0) - Number(p.paid_amount || 0)
      if (outstanding <= 0) return false
      const diff = daysBetween(today, p.due_date) // negative => overdue
      return diff <= 2
    })

    if (relevant.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, note: 'nothing due' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Fetch supporting data
    const propIds = [...new Set(relevant.map((p) => p.property_id))]
    const tenantIds = [...new Set(relevant.map((p) => p.tenant_id))]
    const unitIds = [...new Set(relevant.map((p) => p.unit_id).filter(Boolean))] as string[]
    const workspaceIds = [...new Set(relevant.map((p) => p.workspace_id))]

    const [{ data: props }, { data: tenants }, { data: units }, { data: invoices }] =
      await Promise.all([
        supabase.from('properties').select('id, name').in('id', propIds),
        supabase.from('tenants').select('id, name').in('id', tenantIds),
        unitIds.length
          ? supabase.from('floor_units').select('id, corp_number').in('id', unitIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from('invoices')
          .select('invoice_number, tenant_id, property_id, due_date, amount')
          .in('property_id', propIds),
      ])

    const propMap = new Map((props || []).map((x: any) => [x.id, x]))
    const tenantMap = new Map((tenants || []).map((x: any) => [x.id, x]))
    const unitMap = new Map((units || []).map((x: any) => [x.id, x]))
    const invoiceKey = (inv: any) =>
      `${inv.tenant_id}|${inv.property_id}|${inv.due_date}|${Number(inv.amount)}`
    const invoiceMap = new Map((invoices || []).map((x: any) => [invoiceKey(x), x.invoice_number]))

    // 3. Members to notify: admin + member roles per workspace
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

    // Map user -> property restriction set (empty = unrestricted)
    const restrictedProps = new Map<string, Set<string>>()
    for (const a of access || []) {
      if (!restrictedProps.has(a.user_id)) restrictedProps.set(a.user_id, new Set())
      restrictedProps.get(a.user_id)!.add(a.property_id)
    }

    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id, name')
      .in('id', workspaceIds)
    const wsMap = new Map((workspaces || []).map((x: any) => [x.id, x.name]))

    const userIds = [...new Set((roles || []).map((r) => r.user_id))]

    // Fetch emails + names for these users
    const emailMap = new Map<string, string>()
    for (const uid of userIds) {
      const { data: u } = await supabase.auth.admin.getUserById(uid)
      if (u?.user?.email) emailMap.set(uid, u.user.email)
    }
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', userIds)
    const nameMap = new Map((profiles || []).map((x: any) => [x.user_id, x.full_name]))

    let sent = 0

    // 4. For each user, build consolidated payload
    for (const role of roles || []) {
      const email = emailMap.get(role.user_id)
      if (!email) continue

      // Super admins are always unrestricted, same as has_property_access() everywhere else
      // in the app — any user_property_access rows on a super admin are leftovers from
      // before they were promoted and must not narrow what they're notified about.
      const restrict = role.role === 'super_admin' ? undefined : restrictedProps.get(role.user_id)
      const userPayments = relevant.filter((p) => {
        if (p.workspace_id !== role.workspace_id) return false
        if (restrict && restrict.size > 0 && !restrict.has(p.property_id)) return false
        return true
      })
      if (userPayments.length === 0) continue

      const overdue: any[] = []
      const upcoming: any[] = []
      for (const p of userPayments) {
        const diff = daysBetween(today, p.due_date)
        const prop = propMap.get(p.property_id) as any
        const tenant = tenantMap.get(p.tenant_id) as any
        const unit = p.unit_id ? (unitMap.get(p.unit_id) as any) : null
        const outstanding = Number(p.amount || 0) - Number(p.paid_amount || 0)
        const invNum = invoiceMap.get(
          `${p.tenant_id}|${p.property_id}|${p.due_date}|${Number(p.amount)}`
        )
        const item = {
          tenantName: tenant?.name || 'Tenant',
          propertyName: prop?.name || 'Property',
          unitLabel: unit?.corp_number || undefined,
          amount: outstanding,
          dueDate: p.due_date,
          invoiceNumber: invNum,
        }
        if (diff < 0) overdue.push({ ...item, daysOverdue: Math.abs(diff) })
        else upcoming.push({ ...item, daysUntilDue: diff })
      }

      // Only send if there's actually overdue OR upcoming within 2 days
      if (overdue.length === 0 && upcoming.length === 0) continue

      // Idempotency: one email per user per day
      const idempotencyKey = `payment-reminders-${role.user_id}-${today}`

      const { error: sendErr } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'payment-reminders',
          recipientEmail: email,
          idempotencyKey,
          templateData: {
            recipientName: nameMap.get(role.user_id) || undefined,
            workspaceName: wsMap.get(role.workspace_id) || 'Rent Keeper',
            overdue,
            upcoming,
          },
        },
      })
      if (sendErr) {
        console.error('send failed', role.user_id, sendErr)
        summary.push({ user_id: role.user_id, error: String(sendErr) })
      } else {
        sent++
        summary.push({
          user_id: role.user_id,
          overdue: overdue.length,
          upcoming: upcoming.length,
        })
      }
    }

    const failed = summary.filter((s) => s.error)
    if (failed.length > 0) {
      await notifyCronFailure(supabase, {
        cronName: 'Send Payment Reminders',
        ranAtIso: new Date().toISOString(),
        items: failed.map((s) => ({
          label: nameMap.get(s.user_id) || s.user_id,
          message: String(s.error),
        })),
      })
    }

    return new Response(JSON.stringify({ success: true, sent, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-payment-reminders failed', err)
    await notifyCronFailure(supabase, {
      cronName: 'Send Payment Reminders',
      ranAtIso: new Date().toISOString(),
      topLevelError: (err as Error).message,
    })
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
