-- Create user profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  company TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'viewer');

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  mwp_managed DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'inactive')),
  join_date TIMESTAMPTZ DEFAULT now(),
  last_invoiced TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Create contracts table
CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  company_name TEXT NOT NULL,
  initial_mw DECIMAL(10,2) NOT NULL,
  package TEXT NOT NULL CHECK (package IN ('starter', 'pro', 'custom')),
  modules JSONB DEFAULT '[]'::jsonb,
  addons JSONB DEFAULT '[]'::jsonb,
  custom_pricing JSONB DEFAULT '{}'::jsonb,
  volume_discounts JSONB DEFAULT '{
    "annualUpfrontDiscount": 5,
    "siteSizeThreshold": 3,
    "siteSizeDiscount": 0,
    "portfolio50MW": 5,
    "portfolio100MW": 10,
    "portfolio150MW": 15,
    "portfolio200MW": 20
  }'::jsonb,
  minimum_charge DECIMAL(10,2) DEFAULT 0,
  billing_frequency TEXT DEFAULT 'annual' CHECK (billing_frequency IN ('quarterly', 'biannual', 'annual')),
  next_invoice_date TIMESTAMPTZ,
  contract_status TEXT DEFAULT 'active' CHECK (contract_status IN ('active', 'pending', 'expired', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on contracts
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- Create currency_settings table
CREATE TABLE public.currency_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  currency TEXT DEFAULT 'EUR' CHECK (currency IN ('EUR', 'USD')),
  exchange_rate DECIMAL(10,4) DEFAULT 0.92,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on currency_settings
ALTER TABLE public.currency_settings ENABLE ROW LEVEL SECURITY;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger for profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for customers
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for contracts
CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for currency_settings
CREATE TRIGGER update_currency_settings_updated_at
  BEFORE UPDATE ON public.currency_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  
  -- Insert default currency settings
  INSERT INTO public.currency_settings (user_id)
  VALUES (NEW.id);
  
  -- Assign default 'manager' role to new users
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'manager');
  
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for customers
CREATE POLICY "Users can view their own customers"
  ON public.customers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own customers"
  ON public.customers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own customers"
  ON public.customers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own customers"
  ON public.customers FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for contracts
CREATE POLICY "Users can view their own contracts"
  ON public.contracts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own contracts"
  ON public.contracts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contracts"
  ON public.contracts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contracts"
  ON public.contracts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for currency_settings
CREATE POLICY "Users can view their own currency settings"
  ON public.currency_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own currency settings"
  ON public.currency_settings FOR UPDATE
  USING (auth.uid() = user_id);