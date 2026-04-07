import { SetMetadata } from '@nestjs/common';
import type { PlatformRoleValue } from '../constants/access';

export const PLATFORM_ROLES_KEY = 'platform_roles';
export const PlatformRoles = (...roles: PlatformRoleValue[]) => SetMetadata(PLATFORM_ROLES_KEY, roles);
