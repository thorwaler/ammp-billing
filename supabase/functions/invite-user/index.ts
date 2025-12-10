import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation helpers
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = ['admin', 'manager', 'viewer'] as const;
const MAX_EMAIL_LENGTH = 255;
const MAX_NAME_LENGTH = 100;
const MIN_NAME_LENGTH = 1;

function validateEmail(email: unknown): { valid: boolean; error?: string } {
  if (typeof email !== 'string') {
    return { valid: false, error: 'Email must be a string' };
  }
  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Email is required' };
  }
  if (trimmed.length > MAX_EMAIL_LENGTH) {
    return { valid: false, error: `Email must be less than ${MAX_EMAIL_LENGTH} characters` };
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }
  return { valid: true };
}

function validateName(name: unknown): { valid: boolean; error?: string } {
  if (typeof name !== 'string') {
    return { valid: false, error: 'Name must be a string' };
  }
  const trimmed = name.trim();
  if (trimmed.length < MIN_NAME_LENGTH) {
    return { valid: false, error: 'Name is required' };
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { valid: false, error: `Name must be less than ${MAX_NAME_LENGTH} characters` };
  }
  return { valid: true };
}

function validateRole(role: unknown): { valid: boolean; error?: string } {
  if (typeof role !== 'string') {
    return { valid: false, error: 'Role must be a string' };
  }
  if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
    return { valid: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` };
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

    const { email, name, role } = body;
    
    // Get the origin URL to redirect users back to the same environment (preview or production)
    const rawUrl = req.headers.get('origin') || req.headers.get('referer');
    
    // Extract just the origin (scheme + host) from the URL, stripping any paths or query params
    let cleanOrigin: string | undefined;
    if (rawUrl) {
      try {
        const url = new URL(rawUrl);
        cleanOrigin = url.origin; // Gets just "https://preview--ammp-billing.lovable.app"
        console.log(`Redirect URL: raw=${rawUrl}, clean=${cleanOrigin}`);
      } catch (e) {
        console.error('Failed to parse origin URL:', rawUrl, e);
        cleanOrigin = undefined;
      }
    }
    
    // Validate all inputs
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return new Response(
        JSON.stringify({ error: emailValidation.error }),
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

    const sanitizedEmail = (email as string).trim().toLowerCase();
    const sanitizedName = (name as string).trim();
    const sanitizedRole = role as string;

    // Invite user - Supabase automatically sends a magic link email
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.inviteUserByEmail(sanitizedEmail, {
      data: { full_name: sanitizedName },
      redirectTo: cleanOrigin
    });

    if (createError) {
      console.error('Error creating user:', createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // The handle_new_user trigger will create the profile and default role
    // But we need to update the role if it's not the default 'manager'
    if (sanitizedRole !== 'manager') {
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .update({ role: sanitizedRole })
        .eq('user_id', newUser.user.id);

      if (roleError) {
        console.error('Error updating role:', roleError);
      }
    }

    // Update the profile with the full name
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ full_name: sanitizedName })
      .eq('id', newUser.user.id);

    if (profileError) {
      console.error('Error updating profile:', profileError);
    }

    console.log(`User ${sanitizedEmail} created by admin ${user.email} with role ${sanitizedRole}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          name: sanitizedName,
          role: sanitizedRole
        },
        message: `Invitation email sent to ${sanitizedEmail}. They can click the link to set up their account.`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in invite-user:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
