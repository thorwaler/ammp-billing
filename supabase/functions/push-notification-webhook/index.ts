import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SLACK_GATEWAY_URL = 'https://connector-gateway.lovable.dev/slack/api';
const PREVIEW_URL = 'https://id-preview--c3eaa719-b178-42f2-8022-18c351e01c55.lovable.app';

interface NotificationPayload {
  notification_id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  metadata: Record<string, any>;
  contract_id: string | null;
  created_at: string;
  is_test?: boolean;
}

interface NotificationSettings {
  zapier_webhook_url: string | null;
  webhook_enabled: boolean;
  notification_types: string[];
  min_severity: string;
}

const severityOrder: Record<string, number> = {
  'info': 0,
  'success': 1,
  'warning': 2,
  'error': 3,
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: NotificationPayload = await req.json();
    console.log('Received notification payload:', JSON.stringify(payload));

    const { type, title, message, severity, metadata, contract_id, created_at, is_test } = payload;

    // Create Supabase client with service role for accessing notification_settings
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch shared notification settings (team-wide, not user-specific)
    const { data: settings, error: settingsError } = await supabase
      .from('notification_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching notification settings:', settingsError);
      return new Response(JSON.stringify({ message: 'Error fetching settings' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!settings) {
      console.log('No notification settings configured');
      return new Response(JSON.stringify({ message: 'No webhook configured' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const notificationSettings = settings as NotificationSettings;

    // Check if webhook is enabled
    if (!notificationSettings.webhook_enabled || !notificationSettings.zapier_webhook_url) {
      console.log('Webhook not enabled or no URL configured');
      return new Response(JSON.stringify({ message: 'Webhook not enabled' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if notification type matches filters (skip for test notifications)
    if (!is_test && !notificationSettings.notification_types.includes(type)) {
      console.log(`Notification type '${type}' not in filter list`);
      return new Response(JSON.stringify({ message: 'Notification type filtered out' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if severity meets minimum threshold (skip for test notifications)
    const minSeverity = notificationSettings.min_severity || 'info';
    if (!is_test && severityOrder[severity] < severityOrder[minSeverity]) {
      console.log(`Notification severity '${severity}' below minimum '${minSeverity}'`);
      return new Response(JSON.stringify({ message: 'Severity below threshold' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prepare webhook payload
    const webhookPayload = {
      type,
      title,
      message,
      severity,
      metadata: metadata || {},
      contract_id,
      timestamp: created_at,
      app_name: 'AMMP Revenue & Invoicing',
      is_test: is_test || false,
    };

    console.log('Sending to webhook:', notificationSettings.zapier_webhook_url);
    console.log('Webhook payload:', JSON.stringify(webhookPayload));

    // Send to webhook
    const webhookResponse = await fetch(notificationSettings.zapier_webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    });

    console.log('Webhook response status:', webhookResponse.status);

    // --- Slack delivery (parallel to generic webhook) ---
    let slackResults: any[] | undefined;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const slackApiKey = Deno.env.get('SLACK_API_KEY');

    if (lovableApiKey && slackApiKey) {
      const { data: slackRoutes, error: routesError } = await supabase
        .from('slack_notification_routes')
        .select('*')
        .eq('notification_type', type)
        .eq('enabled', true);

      if (routesError) {
        console.error('Error fetching Slack routes:', routesError);
      } else if (slackRoutes && slackRoutes.length > 0) {
        const severityEmoji: Record<string, string> = {
          critical: ':rotating_light:',
          error: ':x:',
          warning: ':warning:',
          info: ':information_source:',
        };
        const emoji = severityEmoji[severity?.toLowerCase()] || ':bell:';
        const lines = [
          `${emoji} *${title}*`,
          '',
          message,
          '',
          `*Type:* ${type}`,
          `*Severity:* ${severity}`,
        ];
        if (contract_id) {
          lines.push(`*Contract:* <${PREVIEW_URL}/contracts/${contract_id}|Open contract>`);
        }
        if (metadata && Object.keys(metadata).length > 0) {
          lines.push('', '*Details:*', '```json', JSON.stringify(metadata, null, 2), '```');
        }
        const slackText = lines.join('\n');

        slackResults = [];
        for (const route of slackRoutes) {
          const slackResponse = await fetch(`${SLACK_GATEWAY_URL}/chat.postMessage`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${lovableApiKey}`,
              'X-Connection-Api-Key': slackApiKey,
              'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({
              channel: route.channel_id,
              text: slackText,
              username: 'AMMP Alerts',
              icon_emoji: ':bell:',
            }),
          });

          const responseText = await slackResponse.text();
          let responseData: any;
          try {
            responseData = JSON.parse(responseText);
          } catch {
            responseData = { raw: responseText };
          }

          if (!slackResponse.ok || !responseData.ok) {
            const reason = responseData.error || responseData.message || `HTTP ${slackResponse.status}`;
            console.error(`Slack post failed for ${route.channel_id}:`, reason, responseData);
            slackResults.push({ channel_id: route.channel_id, success: false, error: reason });
          } else {
            console.log(`Slack message posted to ${route.channel_id}:`, responseData.ts);
            slackResults.push({ channel_id: route.channel_id, success: true, ts: responseData.ts });
          }
        }
      } else {
        console.log(`No Slack route configured for notification type '${type}'`);
      }
    } else {
      console.log('Slack connector not configured; skipping Slack delivery');
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Notification sent to webhook',
      webhookStatus: webhookResponse.status,
      slackResults,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error processing webhook notification:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});