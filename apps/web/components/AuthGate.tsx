'use client';

import { meetsRole, useAuthRole, type AuthRole } from '@/lib/auth-role';
import { LockedPlaceholder } from './LockedPlaceholder';

/** Reusable role gate. When the user doesn't meet the required role we show
 *  the shared LockedPlaceholder which points back at the single SignInButton
 *  in the sidebar / header — no per-page password form to maintain. */
export function AuthGate({
  require,
  children,
  className,
}: {
  require: AuthRole | AuthRole[];
  children: React.ReactNode;
  className?: string;
}) {
  const { role } = useAuthRole();

  if (meetsRole(role, require)) return <>{children}</>;

  const requiredList = Array.isArray(require) ? require : [require];
  const subtitle = requiredList
    .map((r) => r[0].toUpperCase() + r.slice(1))
    .join(' or ') + ' access required';

  return <LockedPlaceholder description={subtitle} className={className} />;
}
