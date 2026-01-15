-- Create a function to check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
  )
$$;

-- Update the handle_admin_user trigger to set super_admin for vrk1995@gmail.com
CREATE OR REPLACE FUNCTION public.handle_admin_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if the new user's email is the super admin email
  IF NEW.email = 'vrk1995@gmail.com' THEN
    -- Remove any existing roles for this user
    DELETE FROM public.user_roles WHERE user_id = NEW.id;
    
    -- Insert super_admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- Auto-approve the super admin user
    UPDATE public.profiles 
    SET is_approved = true 
    WHERE user_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$function$;