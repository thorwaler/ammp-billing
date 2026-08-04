import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/slack/api';

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  num_members?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const slackApiKey = Deno.env.get('SLACK_API_KEY');

    if (!lovableApiKey || !slackApiKey) {
      return new Response(JSON.stringify({
        error: 'Slack connector not configured',
        needsReconnect: false,
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const channels: SlackChannel[] = [];
    let cursor = '';
    let attempts = 0;
    const maxAttempts = 10;

    do {
      const query = new URLSearchParams();
      query.set('limit', '200');
      query.set('types', 'public_channel');
      if (cursor) query.set('cursor', cursor);

      const response = await fetch(`${GATEWAY_URL}/conversations.list?${query.toString()}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'X-Connection-Api-Key': slackApiKey,
        },
      });

      const responseText = await response.text();
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`Non-JSON Slack response (HTTP ${response.status}): ${responseText.slice(0, 200)}`);
      }

      if (!response.ok || !data.ok) {
        const error = data.error || data.message || `HTTP ${response.status}`;
        const needsReconnect = error === 'missing_scope' || error === 'token_revoked' || error === 'invalid_auth';
        return new Response(JSON.stringify({ error, needsReconnect }), {
          status: response.ok ? 403 : response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      for (const channel of data.channels || []) {
        channels.push({
          id: channel.id,
          name: channel.name,
          is_private: channel.is_private || false,
          num_members: channel.num_members,
        });
      }

      cursor = data.response_metadata?.next_cursor || '';
      attempts++;
    } while (cursor && attempts < maxAttempts);

    channels.sort((a, b) => a.name.localeCompare(b.name));

    return new Response(JSON.stringify({ channels }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error listing Slack channels:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
