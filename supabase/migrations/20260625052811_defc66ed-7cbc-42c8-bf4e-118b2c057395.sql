
-- Allow admins and super admins to view all profiles (fixes team list showing "Unnamed User")
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin') OR is_super_admin(auth.uid()));

-- Allow admins and super admins to update any profile (name, approval, etc.)
DROP POLICY IF EXISTS "Admins can update approval status" ON public.profiles;
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin') OR is_super_admin(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin') OR is_super_admin(auth.uid()));
