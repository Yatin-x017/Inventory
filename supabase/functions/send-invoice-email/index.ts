const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function formatMoney(n: number) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`
}

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildEmailHtml({ customerName, invoiceNumber, items, total, date }: any) {
  const safeName = escapeHtml(customerName || 'Customer')
  const rows = (items || [])
    .map(
      (l: any) => `
        <tr>
          <td style="padding:8px 0;color:#333;">${escapeHtml(l.item_name)}</td>
          <td style="padding:8px 0;color:#333;text-align:center;">${escapeHtml(l.quantity)}</td>
          <td style="padding:8px 0;color:#333;text-align:right;">${formatMoney(l.unit_price * l.quantity)}</td>
        </tr>`
    )
    .join('')

  return `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#222;">
    <div style="background:#1a56db;padding:20px 24px;border-radius:8px 8px 0 0;">
      <h2 style="margin:0;color:#fff;">DR Telecommunications Pvt Ltd</h2>
      <p style="margin:4px 0 0;color:#dbe6fd;font-size:13px;">Authorized Mobile &amp; Electronics Dealer</p>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
      <p>Dear ${safeName},</p>
      <p>Thank you for your purchase. Your invoice has been successfully generated.</p>
      <table style="width:100%;font-size:14px;margin:16px 0;border-collapse:collapse;">
        <tr><td style="padding:4px 0;color:#666;">Invoice Number</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(invoiceNumber)}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Date</td><td style="padding:4px 0;text-align:right;">${escapeHtml(date)}</td></tr>
      </table>
      <table style="width:100%;font-size:13px;border-top:1px solid #eee;border-bottom:1px solid #eee;">
        ${rows}
      </table>
      <table style="width:100%;font-size:15px;margin-top:12px;">
        <tr><td style="font-weight:600;">Total Amount</td><td style="text-align:right;font-weight:600;">${formatMoney(total)}</td></tr>
      </table>
      <p style="margin-top:24px;">Thank you for choosing DR Telecommunications Pvt Ltd.</p>
      <p style="color:#666;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">
        DR Telecommunications Pvt Ltd<br/>
        support@drtelecommunications.in
      </p>
    </div>
  </div>`
}

function buildEmailText({ customerName, invoiceNumber, items, total, date }: any) {
  const lines = (items || [])
    .map((l: any) => `  ${l.item_name} x${l.quantity} - ${formatMoney(l.unit_price * l.quantity)}`)
    .join('\n')
  return `DR Telecommunications Pvt Ltd

Dear ${customerName || 'Customer'},

Thank you for your purchase. Your invoice has been successfully generated.

Invoice Number: ${invoiceNumber}
Date: ${date}

${lines}

Total Amount: ${formatMoney(total)}

Thank you for choosing DR Telecommunications Pvt Ltd.
support@drtelecommunications.in`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { customerName, customerEmail, invoiceNumber, items, total, date } = await req.json()

    if (!customerEmail) {
      return new Response(JSON.stringify({ error: 'customerEmail is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'DR Telecommunications <onboarding@resend.dev>',
        to: [customerEmail],
        subject: `Your Invoice ${invoiceNumber} – DR Telecommunications Pvt Ltd`,
        html: buildEmailHtml({ customerName, invoiceNumber, items, total, date }),
        text: buildEmailText({ customerName, invoiceNumber, items, total, date }),
      }),
    })

    const result = await res.json()

    if (!res.ok) {
      return new Response(JSON.stringify({ error: result.message || 'Resend request failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
