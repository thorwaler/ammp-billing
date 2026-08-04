import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface AlertPayload {
  alert_id?: string;
  user_id?: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  metadata?: Record<string, any>;
  contract_id?: string | null;
  customer_id?: string | null;
  invoice_id?: string | null;
  created_at?: string;
  is_test?: boolean;
  /** Optional override: post only to this channel (used by per-channel tests) */
  channel_id?: string | null;
}

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/slack/api';
const PREVIEW_URL = 'https://id-preview--c3eaa719-b178-42f2-8022-18c351e01c55.lovable.app';

const severityEmoji: Record<string, string> = {
  critical: ':rotating_light:',
  error: ':x:',
  warning: ':warning:',
  info: ':information_source:',
};

function buildSlackMessage(payload: AlertPayload): string {
  const { title, description, severity, alert_type, contract_id, customer_id, metadata } = payload;
  const emoji = severityEmoji[severity?.toLowerCase()] || ':bell:';

  const lines: string[] = [
    `${emoji} *${title}*`,
    '',
    description,
    '',
    `*Type:* ${alert_type}`,
    `*Severity:* ${severity}`,
  ];

  if (contract_id) {
    lines.push(`*Contract:* <${PREVIEW_URL}/contracts/${contract_id}|Open contract>`);
  }
  if (customer_id) {
    lines.push(`*Customer:* <${PREVIEW_URL}/customers/${customer_id}|Open customer>`);
  }
  if (metadata && Object.keys(metadata).length > 0) {
    lines.push('', '*Details:*', '```json', JSON.stringify(metadata, null, 2), '```');
  }

  return lines.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: AlertPayload = await req.json();
    console.log('Received Slack alert payload:', JSON.stringify(payload));

    const { alert_type, is_test, channel_id: channelOverride } = payload;

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const slackApiKey = Deno.env.get('SLACK_API_KEY');

    if (!lovableApiKey || !slackApiKey) {
      console.error('Missing Slack connector credentials');
      return new Response(JSON.stringify({ error: 'Slack connector not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: routes, error: routesError } = await supabase
      .from('slack_notification_routes')
      .select('*')
      .eq('notification_type', alert_type)
      .eq('enabled', true);

    if (routesError) {
      console.error('Error fetching Slack routes:', routesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch routes' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!routes || routes.length === 0) {
      console.log(`No Slack route configured for alert type '${alert_type}'`);
      return new Response(JSON.stringify({ message: 'No Slack route configured' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const text = buildSlackMessage(payload);
    const results: any[] = [];

    for (const route of routes) {
      const body = {
        channel: route.channel_id,
        text,
        username: 'AMMP Alerts',
        icon_emoji: ':bell:',
      };

      console.log(`Posting Slack message to channel ${route.channel_id} for type ${alert_type}`);

      const response = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'X-Connection-Api-Key': slackApiKey,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(body),
      });

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }

      if (!response.ok || !responseData.ok) {
        const reason = responseData.error || responseData.message || `HTTP ${response.status}`;
        console.error(`Slack post failed for ${route.channel_id}:`, reason, responseData);
        results.push({ channel_id: route.channel_id, success: false, error: reason, details: responseData });
      } else {
        console.log(`Slack message posted to ${route.channel_id}:`, responseData.ts);
        results.push({ channel_id: route.channel_id, success: true, ts: responseData.ts });
      }
    }

    const allFailed = results.every((r) => !r.success);
    return new Response(JSON.stringify({
      success: !allFailed,
      is_test: is_test || false,
      alert_type,
      results,
    }), {
      status: allFailed ? 502 : 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error posting Slack alert:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
