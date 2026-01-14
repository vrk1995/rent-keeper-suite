-- Create a trigger to automatically assign admin role and approve vrk1995@gmail.com
CREATE OR REPLACE FUNCTION public.handle_admin_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the new user's email is the admin email
  IF NEW.email = 'vrk1995@gmail.com' THEN
    -- Insert admin role if not exists
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- Auto-approve the admin user
    UPDATE public.profiles 
    SET is_approved = true 
    WHERE user_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users for new signups
DROP TRIGGER IF EXISTS on_admin_user_created ON auth.users;
CREATE TRIGGER on_admin_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_admin_user();

-- Also update existing user if they already exist
DO $$
DECLARE
  admin_user_id uuid;
BEGIN
  -- Find existing user with admin email
  SELECT id INTO admin_user_id FROM auth.users WHERE email = 'vrk1995@gmail.com';
  
  IF admin_user_id IS NOT NULL THEN
    -- Add admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (admin_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- Approve the user
    UPDATE public.profiles SET is_approved = true WHERE user_id = admin_user_id;
  END IF;
END;
$$;