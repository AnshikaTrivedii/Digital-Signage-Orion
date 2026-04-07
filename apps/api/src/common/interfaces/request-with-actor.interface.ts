import type { PlatformRoleValue, OrganizationRoleValue } from '../constants/access';

export type RequestActor = {
  userId: string;
  email: string;
  fullName: string;
  platformRole: PlatformRoleValue | null;
  organization?: {
    id: string;
    slug: string;
    role: OrganizationRoleValue;
    status: string;
  };
};

export type RequestWithActor = {
  headers: Record<string, string | string[] | undefined>;
  actor?: RequestActor;
};
