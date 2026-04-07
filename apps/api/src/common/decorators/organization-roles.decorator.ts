import { SetMetadata } from '@nestjs/common';
import type { OrganizationRoleValue } from '../constants/access';

export const ORGANIZATION_ROLES_KEY = 'organization_roles';
export const OrganizationRoles = (...roles: OrganizationRoleValue[]) => SetMetadata(ORGANIZATION_ROLES_KEY, roles);
