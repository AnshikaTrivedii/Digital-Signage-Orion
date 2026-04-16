/**
 * Idempotent demo seed: platform super admin, one active organization,
 * and sample tenant users with role-aligned feature permissions.
 *
 * Requires DATABASE_URL (e.g. from apps/api/.env or repo root .env).
 * Optional: ORION_SEED_PASSWORD (default: OrionDemo!2026)
 *
 * Run: npm run db:seed
 */
import { config } from "dotenv";
import * as path from "path";
import * as bcrypt from "bcryptjs";
import {
    PrismaClient,
    CampaignStatus,
    DeviceStatus,
    FeatureKey,
    FeatureAccessLevel,
    OrganizationRole,
    PlatformRole,
    PlaylistStatus,
    ProofOfPlayStatus,
    SchedulePriority,
    ScheduleStatus,
    TickerPriority,
    TickerSpeed,
    TickerStatus,
    TickerStyle,
    UserStatus,
    OrganizationStatus,
    MembershipStatus,
} from "@prisma/client";

config({ path: path.resolve(__dirname, "../apps/api/.env") });
config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.ORION_SEED_PASSWORD ?? "OrionDemo!2026";

/** Mirrors apps/web/src/lib/permissions/client-permissions.ts legacyRoleDefaults */
const ROLE_PERMISSIONS: Record<
    OrganizationRole,
    Partial<Record<FeatureKey, FeatureAccessLevel>>
> = {
    ORG_ADMIN: {
        DASHBOARD: FeatureAccessLevel.VIEW,
        ASSETS: FeatureAccessLevel.EDIT,
        PLAYLISTS: FeatureAccessLevel.EDIT,
        CAMPAIGNS: FeatureAccessLevel.EDIT,
        SCHEDULE: FeatureAccessLevel.EDIT,
        TICKERS: FeatureAccessLevel.EDIT,
        DEVICES: FeatureAccessLevel.CONTROL,
        REPORTS: FeatureAccessLevel.VIEW,
        TEAM: FeatureAccessLevel.MANAGE,
        SETTINGS: FeatureAccessLevel.MANAGE,
    },
    MANAGER: {
        DASHBOARD: FeatureAccessLevel.VIEW,
        ASSETS: FeatureAccessLevel.VIEW,
        PLAYLISTS: FeatureAccessLevel.VIEW,
        CAMPAIGNS: FeatureAccessLevel.VIEW,
        SCHEDULE: FeatureAccessLevel.VIEW,
        TICKERS: FeatureAccessLevel.VIEW,
        DEVICES: FeatureAccessLevel.VIEW,
        REPORTS: FeatureAccessLevel.VIEW,
        TEAM: FeatureAccessLevel.VIEW,
        SETTINGS: FeatureAccessLevel.VIEW,
    },
    CONTENT_EDITOR: {
        DASHBOARD: FeatureAccessLevel.VIEW,
        ASSETS: FeatureAccessLevel.EDIT,
        PLAYLISTS: FeatureAccessLevel.EDIT,
        CAMPAIGNS: FeatureAccessLevel.EDIT,
        SCHEDULE: FeatureAccessLevel.EDIT,
        TICKERS: FeatureAccessLevel.EDIT,
        DEVICES: FeatureAccessLevel.NONE,
        REPORTS: FeatureAccessLevel.VIEW,
        TEAM: FeatureAccessLevel.NONE,
        SETTINGS: FeatureAccessLevel.NONE,
    },
    ANALYST_VIEWER: {
        DASHBOARD: FeatureAccessLevel.VIEW,
        ASSETS: FeatureAccessLevel.VIEW,
        PLAYLISTS: FeatureAccessLevel.VIEW,
        CAMPAIGNS: FeatureAccessLevel.VIEW,
        SCHEDULE: FeatureAccessLevel.VIEW,
        TICKERS: FeatureAccessLevel.VIEW,
        DEVICES: FeatureAccessLevel.VIEW,
        REPORTS: FeatureAccessLevel.VIEW,
        TEAM: FeatureAccessLevel.NONE,
        SETTINGS: FeatureAccessLevel.NONE,
    },
};

function flattenPermissions(role: OrganizationRole): { featureKey: FeatureKey; accessLevel: FeatureAccessLevel }[] {
    const row = ROLE_PERMISSIONS[role];
    return (Object.entries(row) as [FeatureKey, FeatureAccessLevel][])
        .filter(([, level]) => level !== FeatureAccessLevel.NONE)
        .map(([featureKey, accessLevel]) => ({ featureKey, accessLevel }))
        .sort((a, b) => a.featureKey.localeCompare(b.featureKey));
}

async function hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
}

async function main() {
    console.log("Orion seed: hashing passwords with bcrypt (10 rounds)…");
    const passwordHash = await hashPassword(SEED_PASSWORD);

    const superEmail = "superadmin@demo.local";
    const superUser = await prisma.user.upsert({
        where: { email: superEmail },
        create: {
            email: superEmail,
            fullName: "Demo Super Admin",
            passwordHash,
            platformRole: PlatformRole.SUPER_ADMIN,
            status: UserStatus.ACTIVE,
        },
        update: {
            fullName: "Demo Super Admin",
            passwordHash,
            platformRole: PlatformRole.SUPER_ADMIN,
            status: UserStatus.ACTIVE,
        },
    });
    console.log(`  Super admin: ${superUser.email}`);

    const org = await prisma.organization.upsert({
        where: { slug: "acme-demo" },
        create: {
            name: "Acme Digital Signage (Demo)",
            slug: "acme-demo",
            status: OrganizationStatus.ACTIVE,
            primaryContactName: "Jordan Lee",
            primaryContactEmail: "acme-admin@demo.local",
            salesNotes: "Seeded demo tenant for local development.",
        },
        update: {
            name: "Acme Digital Signage (Demo)",
            status: OrganizationStatus.ACTIVE,
            primaryContactName: "Jordan Lee",
            primaryContactEmail: "acme-admin@demo.local",
        },
    });
    console.log(`  Organization: ${org.name} (${org.slug})`);

    const tenantUsers: { email: string; fullName: string; role: OrganizationRole }[] = [
        { email: "acme-admin@demo.local", fullName: "Jordan Lee", role: OrganizationRole.ORG_ADMIN },
        { email: "acme-manager@demo.local", fullName: "Sam Rivera", role: OrganizationRole.MANAGER },
        { email: "acme-editor@demo.local", fullName: "Riley Chen", role: OrganizationRole.CONTENT_EDITOR },
        { email: "acme-analyst@demo.local", fullName: "Taylor Brooks", role: OrganizationRole.ANALYST_VIEWER },
    ];

    for (const tu of tenantUsers) {
        const user = await prisma.user.upsert({
            where: { email: tu.email },
            create: {
                email: tu.email,
                fullName: tu.fullName,
                passwordHash,
                platformRole: null,
                status: UserStatus.ACTIVE,
            },
            update: {
                fullName: tu.fullName,
                passwordHash,
                platformRole: null,
                status: UserStatus.ACTIVE,
            },
        });

        const membership = await prisma.organizationMembership.upsert({
            where: {
                userId_organizationId: { userId: user.id, organizationId: org.id },
            },
            create: {
                userId: user.id,
                organizationId: org.id,
                role: tu.role,
                status: MembershipStatus.ACTIVE,
            },
            update: {
                role: tu.role,
                status: MembershipStatus.ACTIVE,
            },
        });

        const perms = flattenPermissions(tu.role);
        await prisma.membershipFeaturePermission.deleteMany({ where: { membershipId: membership.id } });
        if (perms.length > 0) {
            await prisma.membershipFeaturePermission.createMany({
                data: perms.map((p) => ({
                    membershipId: membership.id,
                    featureKey: p.featureKey,
                    accessLevel: p.accessLevel,
                })),
            });
        }

        console.log(`  Member: ${tu.email} → ${tu.role}`);
    }

    await prisma.playlistItem.deleteMany({ where: { playlist: { organizationId: org.id } } });
    await prisma.playlist.deleteMany({ where: { organizationId: org.id } });
    await prisma.campaign.deleteMany({ where: { organizationId: org.id } });
    await prisma.scheduleEvent.deleteMany({ where: { organizationId: org.id } });
    await prisma.device.deleteMany({ where: { organizationId: org.id } });
    await prisma.ticker.deleteMany({ where: { organizationId: org.id } });
    await prisma.proofOfPlayLog.deleteMany({ where: { organizationId: org.id } });

    const campaigns = await prisma.$transaction([
        prisma.campaign.create({
            data: {
                organizationId: org.id,
                name: "Summer Flash Sale 2026",
                description: "High-impact retail promotion across all storefronts.",
                assetCount: 14,
                status: CampaignStatus.ACTIVE,
                screens: 45,
                impressions: 124000,
                color: "#4ade80",
            },
        }),
        prisma.campaign.create({
            data: {
                organizationId: org.id,
                name: "Corporate Welcome Loop",
                description: "Professional lobby welcome content for visitors and guests.",
                assetCount: 6,
                status: CampaignStatus.ACTIVE,
                screens: 12,
                impressions: 89000,
                color: "#00e5ff",
            },
        }),
        prisma.campaign.create({
            data: {
                organizationId: org.id,
                name: "Q1 Earnings Broadcast",
                description: "Internal broadcast of quarterly financial results.",
                assetCount: 3,
                status: CampaignStatus.DRAFT,
                screens: 0,
                impressions: 0,
                color: "#a78bfa",
            },
        }),
    ]);

    const playlist = await prisma.playlist.create({
        data: {
            organizationId: org.id,
            name: "Morning Welcome Loop",
            status: PlaylistStatus.ACTIVE,
            screens: 45,
            color: "#4ade80",
            lastPlayedAt: new Date(),
            items: {
                create: [
                    { name: "Welcome_Animation.mp4", type: "video", durationSeconds: 15, position: 0 },
                    { name: "Brand_Logo.png", type: "image", durationSeconds: 8, position: 1 },
                    { name: "Today_Events.html", type: "html", durationSeconds: 10, position: 2 },
                ],
            },
        },
    });

    await prisma.playlistCampaign.createMany({
        data: [
            { playlistId: playlist.id, campaignId: campaigns[0].id, position: 0 },
            { playlistId: playlist.id, campaignId: campaigns[1].id, position: 1 },
        ],
    });

    await prisma.scheduleEvent.createMany({
        data: [
            {
                organizationId: org.id,
                name: "Morning Welcome",
                campaign: campaigns[1].name,
                startTime: "06:00",
                endTime: "10:00",
                days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
                screens: 45,
                status: ScheduleStatus.ACTIVE,
                color: "#4ade80",
                priority: SchedulePriority.HIGH,
                recurring: true,
            },
            {
                organizationId: org.id,
                name: "Flash Sale Push",
                campaign: campaigns[0].name,
                startTime: "10:00",
                endTime: "14:00",
                days: ["Mon", "Wed", "Fri"],
                screens: 80,
                status: ScheduleStatus.SCHEDULED,
                color: "#f87171",
                priority: SchedulePriority.HIGH,
                recurring: true,
            },
        ],
    });

    await prisma.device.createMany({
        data: [
            {
                organizationId: org.id,
                name: "LOBBY-SCR-001",
                status: DeviceStatus.ONLINE,
                location: "Main Lobby",
                ip: "192.168.1.101",
                resolution: "3840x2160",
                uptime: "45d 12h",
                cpu: 23,
                ram: 41,
                temp: 42,
                lastSync: "2 min ago",
                os: "Android 13",
                currentContent: playlist.name,
                currentPlaylistId: playlist.id,
            },
            {
                organizationId: org.id,
                name: "CAFE-SCR-003",
                status: DeviceStatus.OFFLINE,
                location: "London Café",
                ip: "192.168.2.45",
                resolution: "1920x1080",
                uptime: "0d 0h",
                cpu: 0,
                ram: 0,
                temp: 0,
                lastSync: "3 hours ago",
                os: "Android 12",
                currentContent: null,
            },
            {
                organizationId: org.id,
                name: "CONF-SCR-012",
                status: DeviceStatus.ONLINE,
                location: "Berlin Conference",
                ip: "10.0.3.88",
                resolution: "3840x2160",
                uptime: "120d 8h",
                cpu: 18,
                ram: 35,
                temp: 38,
                lastSync: "Just now",
                os: "Android 14",
                currentContent: playlist.name,
                currentPlaylistId: playlist.id,
            },
            {
                organizationId: org.id,
                name: "FOOD-SCR-009",
                status: DeviceStatus.WARNING,
                location: "Paris Food Court",
                ip: "192.168.8.77",
                resolution: "1920x1080",
                uptime: "15d 6h",
                cpu: 89,
                ram: 91,
                temp: 72,
                lastSync: "10 min ago",
                os: "Android 12",
                currentContent: "Menu Board",
            },
        ],
    });

    await prisma.ticker.createMany({
        data: [
            {
                organizationId: org.id,
                text: "FLASH SALE: 50% off all summer collection items - Limited time only!",
                speed: TickerSpeed.NORMAL,
                style: TickerStyle.NEON,
                color: "#f87171",
                status: TickerStatus.ACTIVE,
                priority: TickerPriority.URGENT,
                screens: 45,
            },
            {
                organizationId: org.id,
                text: "Welcome to the visitor lobby. Please keep your access pass visible while on site.",
                speed: TickerSpeed.SLOW,
                style: TickerStyle.CLASSIC,
                color: "#00e5ff",
                status: TickerStatus.ACTIVE,
                priority: TickerPriority.NORMAL,
                screens: 12,
            },
        ],
    });

    await prisma.proofOfPlayLog.createMany({
        data: [
            {
                organizationId: org.id,
                device: "LOBBY-SCR-001",
                content: "Summer_Promo.mp4",
                status: ProofOfPlayStatus.VERIFIED,
                timestamp: new Date(Date.now() - 1000 * 60 * 3),
            },
            {
                organizationId: org.id,
                device: "CONF-SCR-012",
                content: "Corporate_Update.mp4",
                status: ProofOfPlayStatus.VERIFIED,
                timestamp: new Date(Date.now() - 1000 * 60 * 9),
            },
            {
                organizationId: org.id,
                device: "CAFE-SCR-003",
                content: "Menu_Board.html",
                status: ProofOfPlayStatus.FAILED,
                timestamp: new Date(Date.now() - 1000 * 60 * 14),
            },
        ],
    });

    console.log("\nDone. Sign in at the web app with any email above.");
    console.log(`Password (all seeded users): ${SEED_PASSWORD}`);
    console.log("Override password: ORION_SEED_PASSWORD='your-secret' npm run db:seed\n");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
