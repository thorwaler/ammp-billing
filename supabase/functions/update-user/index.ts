import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation helpers
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ROLES = ['admin', 'manager', 'viewer'] as const;
const VALID_STATUSES = ['active', 'inactive'] as const;
const MAX_NAME_LENGTH = 100;
const MIN_NAME_LENGTH = 1;

function validateUuid(uuid: unknown): { valid: boolean; error?: string } {
  if (typeof uuid !== 'string') {
    return { valid: false, error: 'User ID must be a string' };
  }
  if (!UUID_REGEX.test(uuid)) {
    return { valid: false, error: 'Invalid user ID format' };
  }
  return { valid: true };
}

function validateName(name: unknown): { valid: boolean; error?: string } {
  if (name === undefined || name === null) {
    return { valid: true }; // Name is optional for updates
  }
  if (typeof name !== 'string') {
    return { valid: false, error: 'Name must be a string' };
  }
  const trimmed = name.trim();
  if (trimmed.length < MIN_NAME_LENGTH) {
    return { valid: false, error: 'Name cannot be empty' };
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { valid: false, error: `Name must be less than ${MAX_NAME_LENGTH} characters` };
  }
  return { valid: true };
}

function validateRole(role: unknown): { valid: boolean; error?: string } {
  if (role === undefined || role === null) {
    return { valid: true }; // Role is optional for updates
  }
  if (typeof role !== 'string') {
    return { valid: false, error: 'Role must be a string' };
  }
  if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
    return { valid: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` };
  }
  return { valid: true };
}

function validateStatus(status: unknown): { valid: boolean; error?: string } {
  if (status === undefined || status === null) {
    return { valid: true }; // Status is optional for updates
  }
  if (typeof status !== 'string') {
    return { valid: false, error: 'Status must be a string' };
  }
  if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
    return { valid: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` };
  }
  return { valid: true };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Verify authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get the calling user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId, name, role, status } = body;
    
    // Validate all inputs
    const userIdValidation = validateUuid(userId);
    if (!userIdValidation.valid) {
      return new Response(
        JSON.stringify({ error: userIdValidation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const nameValidation = validateName(name);
    if (!nameValidation.valid) {
      return new Response(
        JSON.stringify({ error: nameValidation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const roleValidation = validateRole(role);
    if (!roleValidation.valid) {
      return new Response(
        JSON.stringify({ error: roleValidation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const statusValidation = validateStatus(status);
    if (!statusValidation.valid) {
      return new Response(
        JSON.stringify({ error: statusValidation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update profile name if provided
    if (name) {
      const sanitizedName = (name as string).trim();
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ full_name: sanitizedName })
        .eq('id', userId);

      if (profileError) {
        console.error('Error updating profile:', profileError);
        return new Response(
          JSON.stringify({ error: 'Failed to update profile' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Update role if provided
    if (role) {
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .update({ role })
        .eq('user_id', userId);

      if (roleError) {
        console.error('Error updating role:', roleError);
        return new Response(
          JSON.stringify({ error: 'Failed to update role' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Update user status (ban/unban) if provided
    if (status) {
      if (status === 'inactive') {
        // Ban the user (set banned_until to far future)
        const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          ban_duration: '876000h' // 100 years
        });
        if (banError) {
          console.error('Error banning user:', banError);
        }
      } else if (status === 'active') {
        // Unban the user
        const { error: unbanError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          ban_duration: 'none'
        });
        if (unbanError) {
          console.error('Error unbanning user:', unbanError);
        }
      }
    }

    console.log(`User ${userId} updated by admin ${user.email}`);

    return new Response(
      JSON.stringify({ success: true, message: 'User has been updated' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in update-user:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
