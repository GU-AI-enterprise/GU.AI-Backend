export enum UserRole {
  CUSTOMER = 'customer',
  STAFF = 'staff',
  ADMIN = 'admin',
}

export type Role = keyof typeof UserRole;

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.CUSTOMER]: 1,
  [UserRole.STAFF]: 2,
  [UserRole.ADMIN]: 3,
};

export const hasRoleOrHigher = (userRole: UserRole, requiredRole: UserRole): boolean => {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
};

export const isValidRole = (role: string): role is UserRole => {
  return Object.values(UserRole).includes(role as UserRole);
};
