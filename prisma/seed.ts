import { PrismaClient, PlatformRole, UserStatus, OrganizationStatus, OrganizationRole, MembershipStatus, FeatureKey, FeatureAccessLevel } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Orion Platform...\n');

  // ─── 1. Super Admin ───────────────────────────────────────────
  const superAdminPassword = await bcrypt.hash('admin123', 10);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@orion.dev' },
    update: {},
    create: {
      email: 'admin@orion.dev',
      fullName: 'Orion Super Admin',
      passwordHash: superAdminPassword,
      platformRole: PlatformRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });
  console.log(`✅ Super Admin: ${superAdmin.email} (password: admin123)`);

  // ─── 2. Sample Organization ───────────────────────────────────
  const organization = await prisma.organization.upsert({
    where: { slug: 'acme-digital' },
    update: {},
    create: {
      name: 'Acme Digital Signage',
      slug: 'acme-digital',
      status: OrganizationStatus.ACTIVE,
      primaryContactName: 'John Doe',
      primaryContactEmail: 'john@acme.com',
      salesNotes: 'Demo organization for testing. Has 3 users with different permission levels.',
    },
  });
  console.log(`✅ Organization: ${organization.name} (slug: ${organization.slug})`);

  // ─── 3. Org Admin — full access to everything ─────────────────
  const orgAdminPassword = await bcrypt.hash('orgadmin123', 10);
  const orgAdmin = await prisma.user.upsert({
    where: { email: 'orgadmin@acme.com' },
    update: {},
    create: {
      email: 'orgadmin@acme.com',
      fullName: 'Alice Chen (Org Admin)',
      passwordHash: orgAdminPassword,
      status: UserStatus.ACTIVE,
    },
  });

  const orgAdminMembership = await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: orgAdmin.id, organizationId: organization.id } },
    update: { role: OrganizationRole.ORG_ADMIN, status: MembershipStatus.ACTIVE },
    create: {
      userId: orgAdmin.id,
      organizationId: organization.id,
      role: OrganizationRole.ORG_ADMIN,
      status: MembershipStatus.ACTIVE,
    },
  });

  // Org Admin gets full permissions
  await seedPermissions(orgAdminMembership.id, {
    DASHBOARD: 'VIEW',
    ASSETS: 'EDIT',
    PLAYLISTS: 'EDIT',
    CAMPAIGNS: 'EDIT',
    SCHEDULE: 'EDIT',
    TICKERS: 'EDIT',
    DEVICES: 'CONTROL',
    REPORTS: 'VIEW',
    TEAM: 'MANAGE',
    SETTINGS: 'MANAGE',
  });
  console.log(`✅ Org Admin: ${orgAdmin.email} (password: orgadmin123) — full access`);

  // ─── 4. Content Editor — can edit content, no device/team/settings access ──
  const editorPassword = await bcrypt.hash('editor123', 10);
  const editor = await prisma.user.upsert({
    where: { email: 'editor@acme.com' },
    update: {},
    create: {
      email: 'editor@acme.com',
      fullName: 'Bob Martinez (Editor)',
      passwordHash: editorPassword,
      status: UserStatus.ACTIVE,
    },
  });

  const editorMembership = await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: editor.id, organizationId: organization.id } },
    update: { role: OrganizationRole.CONTENT_EDITOR, status: MembershipStatus.ACTIVE },
    create: {
      userId: editor.id,
      organizationId: organization.id,
      role: OrganizationRole.CONTENT_EDITOR,
      status: MembershipStatus.ACTIVE,
    },
  });

  await seedPermissions(editorMembership.id, {
    DASHBOARD: 'VIEW',
    ASSETS: 'EDIT',
    PLAYLISTS: 'EDIT',
    CAMPAIGNS: 'EDIT',
    SCHEDULE: 'EDIT',
    TICKERS: 'EDIT',
    DEVICES: 'NONE',
    REPORTS: 'VIEW',
    TEAM: 'NONE',
    SETTINGS: 'NONE',
  });
  console.log(`✅ Content Editor: ${editor.email} (password: editor123) — edit content, no devices/team/settings`);

  // ─── 5. Analyst Viewer — read-only access, no team/settings ───
  const viewerPassword = await bcrypt.hash('viewer123', 10);
  const viewer = await prisma.user.upsert({
    where: { email: 'viewer@acme.com' },
    update: {},
    create: {
      email: 'viewer@acme.com',
      fullName: 'Carol Singh (Viewer)',
      passwordHash: viewerPassword,
      status: UserStatus.ACTIVE,
    },
  });

  const viewerMembership = await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: viewer.id, organizationId: organization.id } },
    update: { role: OrganizationRole.ANALYST_VIEWER, status: MembershipStatus.ACTIVE },
    create: {
      userId: viewer.id,
      organizationId: organization.id,
      role: OrganizationRole.ANALYST_VIEWER,
      status: MembershipStatus.ACTIVE,
    },
  });

  await seedPermissions(viewerMembership.id, {
    DASHBOARD: 'VIEW',
    ASSETS: 'VIEW',
    PLAYLISTS: 'VIEW',
    CAMPAIGNS: 'VIEW',
    SCHEDULE: 'VIEW',
    TICKERS: 'VIEW',
    DEVICES: 'VIEW',
    REPORTS: 'VIEW',
    TEAM: 'NONE',
    SETTINGS: 'NONE',
  });
  console.log(`✅ Analyst Viewer: ${viewer.email} (password: viewer123) — view-only, no team/settings`);

  console.log('\n🎉 Seed complete! All test accounts ready.\n');
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│  Login Credentials                                         │');
  console.log('├──────────────────────┬─────────────┬────────────────────────┤');
  console.log('│  Email               │  Password   │  Role                  │');
  console.log('├──────────────────────┼─────────────┼────────────────────────┤');
  console.log('│  admin@orion.dev     │  admin123   │  SUPER_ADMIN (platform)│');
  console.log('│  orgadmin@acme.com   │  orgadmin123│  ORG_ADMIN             │');
  console.log('│  editor@acme.com     │  editor123  │  CONTENT_EDITOR        │');
  console.log('│  viewer@acme.com     │  viewer123  │  ANALYST_VIEWER        │');
  console.log('└──────────────────────┴─────────────┴────────────────────────┘');
}

async function seedPermissions(
  membershipId: string,
  permissions: Partial<Record<FeatureKey, FeatureAccessLevel | 'NONE' | 'VIEW' | 'EDIT' | 'MANAGE' | 'CONTROL'>>,
) {
  // Delete existing permissions for idempotency
  await prisma.membershipFeaturePermission.deleteMany({ where: { membershipId } });

  const entries = Object.entries(permissions).filter(([, level]) => level !== 'NONE') as [FeatureKey, FeatureAccessLevel][];

  if (entries.length > 0) {
    await prisma.membershipFeaturePermission.createMany({
      data: entries.map(([featureKey, accessLevel]) => ({
        membershipId,
        featureKey: featureKey as FeatureKey,
        accessLevel: accessLevel as FeatureAccessLevel,
      })),
    });
  }
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
