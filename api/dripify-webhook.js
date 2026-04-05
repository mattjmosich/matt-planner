// =============================================================
// DRIPIFY WEBHOOK — Vercel Serverless Function
// =============================================================
// This endpoint receives POST requests from Zapier when Dripify
// fires an event (e.g. connection sent, DM sent, response received).
//
// HOW TO WIRE UP (future):
// 1. In Zapier, create a Zap: Dripify trigger → Webhook POST
// 2. Point the webhook to: https://matt-planner.vercel.app/api/dripify-webhook
// 3. Map the Dripify fields to the JSON body below
//
// EXPECTED PAYLOAD:
// {
//   "field": "conn" | "dms" | "resp",   // which metric to increment
//   "count": 1,                          // how many to add (default 1)
//   "day":   0-6                         // optional: day index (0=Sun). Defaults to today.
// }
//
// This function reads the current_week row from Supabase,
// increments the specified field for the given day, and writes it back.
// =============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // Use service role key here, NOT anon key
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { field, count = 1, day } = req.body;

    // Validate field
    const ALLOWED_FIELDS = ['conn', 'dms', 'resp'];
    if (!ALLOWED_FIELDS.includes(field)) {
      return res.status(400).json({ error: `Invalid field. Must be one of: ${ALLOWED_FIELDS.join(', ')}` });
    }

    // Determine day index (0=Sun ... 6=Sat)
    const dayIndex = day !== undefined ? day : new Date().getDay();
    if (dayIndex < 0 || dayIndex > 6) {
      return res.status(400).json({ error: 'Day must be 0-6' });
    }

    // Read current week data
    const { data: weekRow, error: readErr } = await supabase
      .from('current_week')
      .select('daily')
      .eq('id', 'current')
      .single();

    if (readErr || !weekRow) {
      return res.status(500).json({ error: 'Could not read current week', detail: readErr });
    }

    // Increment the field
    const daily = weekRow.daily;
    if (!daily[dayIndex]) {
      daily[dayIndex] = { comments:0, outreach:0, posts:0, calls:0, conn:0, dms:0, resp:0, meet:0, liappt:0 };
    }
    daily[dayIndex][field] = (daily[dayIndex][field] || 0) + count;

    // Write back
    const { error: writeErr } = await supabase
      .from('current_week')
      .update({ daily, updated_at: new Date().toISOString() })
      .eq('id', 'current');

    if (writeErr) {
      return res.status(500).json({ error: 'Could not update', detail: writeErr });
    }

    return res.status(200).json({ ok: true, field, newValue: daily[dayIndex][field] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
