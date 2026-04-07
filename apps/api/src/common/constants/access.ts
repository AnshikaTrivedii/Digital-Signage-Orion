export const PLATFORM_ROLES = ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SALES', 'SUPPORT'] as const;
export const ORGANIZATION_ROLES = ['ORG_ADMIN', 'MANAGER', 'CONTENT_EDITOR', 'ANALYST_VIEWER'] as const;

export type PlatformRoleValue = (typeof PLATFORM_ROLES)[number];
export type OrganizationRoleValue = (typeof ORGANIZATION_ROLES)[number];
