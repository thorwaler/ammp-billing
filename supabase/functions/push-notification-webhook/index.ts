import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { user_id, type, title, message, severity, metadata, contract_id, created_at, is_test } = payload;

    if (!user_id) {
      console.error('Missing user_id in payload');
      return new Response(JSON.stringify({ error: 'Missing user_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client with service role for accessing notification_settings
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch user's notification settings
    const { data: settings, error: settingsError } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (settingsError) {
      console.log('No notification settings found for user:', user_id);
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

    // Check if notification type matches user's filters (skip for test notifications)
    if (!is_test && !notificationSettings.notification_types.includes(type)) {
      console.log(`Notification type '${type}' not in user's filter list`);
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

    console.log('Sending to Zapier webhook:', notificationSettings.zapier_webhook_url);
    console.log('Webhook payload:', JSON.stringify(webhookPayload));

    // Send to Zapier webhook
    const webhookResponse = await fetch(notificationSettings.zapier_webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    });

    console.log('Zapier webhook response status:', webhookResponse.status);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Notification sent to webhook',
      webhookStatus: webhookResponse.status 
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
