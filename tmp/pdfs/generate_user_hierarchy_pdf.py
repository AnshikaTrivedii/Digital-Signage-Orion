from pathlib import Path
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, ListFlowable, ListItem


OUTPUT = Path("/Users/aman/Documents/Coding/Digital-Signage-Orion/output/pdf/orion-user-hierarchy-approval-note.pdf")


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="TitleOrion",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=28,
            textColor=colors.HexColor("#0F172A"),
            alignment=TA_CENTER,
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SubtitleOrion",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=15,
            textColor=colors.HexColor("#475569"),
            alignment=TA_CENTER,
            spaceAfter=18,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionOrion",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=19,
            textColor=colors.HexColor("#0F172A"),
            spaceBefore=10,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyOrion",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=15,
            textColor=colors.HexColor("#1E293B"),
            alignment=TA_LEFT,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SmallOrion",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#64748B"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="CalloutTitle",
            parent=styles["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=colors.white,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CalloutBody",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13,
            textColor=colors.white,
        )
    )
    return styles


def para(text, style):
    return Paragraph(text, style)


def bullet_list(items, style):
    return ListFlowable(
        [ListItem(Paragraph(item, style), leftIndent=8) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=16,
        bulletFontName="Helvetica",
        bulletFontSize=8,
    )


def styled_table(data, col_widths):
    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LEADING", (0, 0), (-1, -1), 12),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def callout_box(title, body, styles):
    table = Table(
        [[para(title, styles["CalloutTitle"])], [para(body, styles["CalloutBody"])]],
        colWidths=[170 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#0F766E")),
                ("BOX", (0, 0), (-1, -1), 0, colors.white),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return table


def role_card(role, purpose, can_grant, cannot_grant, styles, tone="#F8FAFC"):
    body = (
        f"<b>Purpose:</b> {purpose}<br/>"
        f"<b>Can grant:</b> {can_grant}<br/>"
        f"<b>Cannot grant:</b> {cannot_grant}"
    )
    table = Table(
        [
            [para(role, ParagraphStyle("RoleHead", parent=styles["SectionOrion"], fontSize=11, leading=13, textColor=colors.HexColor("#0F172A"), spaceBefore=0, spaceAfter=4))],
            [para(body, styles["BodyOrion"])],
        ],
        colWidths=[170 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(tone)),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#64748B"))
    canvas.drawRightString(195 * mm, 10 * mm, f"Page {doc.page}")
    canvas.drawString(15 * mm, 10 * mm, "Orion access model recommendation")
    canvas.restoreState()


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = build_styles()
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=15 * mm,
        bottomMargin=16 * mm,
    )

    generated_on = datetime.now().strftime("%d %b %Y, %I:%M %p")
    story = []

    story.append(Spacer(1, 10))
    story.append(para("Orion User Hierarchy and Access Governance", styles["TitleOrion"]))
    story.append(
        para(
            "Approval note for platform access, tenant administration, and internal delegation design",
            styles["SubtitleOrion"],
        )
    )
    story.append(
        callout_box(
            "Recommended Decision",
            "Adopt a two-layer access model: platform roles for Orion employees and tenant roles for each client organization. "
            "No client user should ever receive a platform role, and no internal employee role should implicitly grant cross-tenant content access unless explicitly approved.",
            styles,
        )
    )
    story.append(Spacer(1, 12))
    story.append(para(f"Prepared for internal approval. Generated on {generated_on}.", styles["SmallOrion"]))
    story.append(Spacer(1, 8))

    story.append(para("1. Executive Summary", styles["SectionOrion"]))
    story.append(
        para(
            "The safest and most scalable approach is to separate access into <b>Platform Scope</b> and <b>Organization Scope</b>. "
            "Platform roles are reserved for Orion staff such as Super Admin and Sales. Organization roles are reserved for each client and apply only inside that client account. "
            "This prevents accidental overreach, simplifies auditing, and keeps the system easier to scale as more customers and devices are added.",
            styles["BodyOrion"],
        )
    )
    story.append(
        bullet_list(
            [
                "<b>Platform roles</b> govern who can create, activate, suspend, and oversee organizations across the whole system.",
                "<b>Organization roles</b> govern who can manage users, devices, playlists, campaigns, schedules, and reports inside one client organization.",
                "<b>Delegation must flow downward only</b>: higher roles can invite or assign lower roles inside their allowed scope, but lower roles cannot create peers or superiors without a specific permission.",
                "<b>Every critical action must be audited</b>: invitations, role changes, organization activation, device reassignment, and emergency access.",
            ],
            styles["BodyOrion"],
        )
    )

    story.append(para("2. Recommended Hierarchy", styles["SectionOrion"]))
    story.append(para("<b>Platform roles</b> should be reserved only for Orion employees.", styles["BodyOrion"]))
    story.append(role_card("SUPER_ADMIN", "Owns the full platform, organization lifecycle, internal access, and emergency controls.", "Any platform role and the first tenant admin.", "Nothing outside policy-based dual-control actions.", styles, "#F8FAFC"))
    story.append(Spacer(1, 7))
    story.append(role_card("PLATFORM_ADMIN", "Runs onboarding, tenant setup, support, and operational administration.", "Tenant roles within approved policy.", "Platform roles.", styles, "#F1F5F9"))
    story.append(Spacer(1, 7))
    story.append(role_card("SALES", "Creates draft client accounts and initiates the onboarding handoff.", "The first client contact invitation only.", "Platform roles or unrestricted client operations.", styles, "#F8FAFC"))
    story.append(Spacer(1, 7))
    story.append(role_card("SUPPORT", "Troubleshoots issues using read-only or time-bound elevated access.", "No permanent grants.", "Standing admin rights.", styles, "#F1F5F9"))
    story.append(Spacer(1, 10))
    story.append(para("<b>Organization roles</b> should exist only inside a single client organization.", styles["BodyOrion"]))
    story.append(role_card("ORG_ADMIN", "Highest client-side authority for tenant users, locations, devices, content, schedules, and reports.", "All tenant roles within the same organization.", "Any platform role or access outside their organization.", styles, "#F8FAFC"))
    story.append(Spacer(1, 7))
    story.append(role_card("MANAGER", "Operational monitoring, campaign approvals, and business-level decision support.", "Viewer-level access only if explicitly enabled.", "Admin or cross-tenant access.", styles, "#F1F5F9"))
    story.append(Spacer(1, 7))
    story.append(role_card("CONTENT_EDITOR", "Creates and updates media, playlists, campaigns, and schedules.", "No admin grants by default.", "User administration.", styles, "#F8FAFC"))
    story.append(Spacer(1, 7))
    story.append(role_card("ANALYST_VIEWER", "Read-only access to dashboards, reports, device health, and campaign analytics.", "No grants.", "Any write actions.", styles, "#F1F5F9"))
    story.append(Spacer(1, 8))
    story.append(
        para(
            "Why this model works: it gives Orion full platform governance while allowing each client organization to self-manage daily operations without ever breaking tenant boundaries.",
            styles["BodyOrion"],
        )
    )

    story.append(PageBreak())

    story.append(para("3. Access Delegation Model", styles["SectionOrion"]))
    story.append(
        styled_table(
            [
                ["Actor", "Delegation Rule"],
                ["SUPER_ADMIN", "Can grant platform roles, seed first tenant admin, transfer ownership."],
                ["PLATFORM_ADMIN", "Can grant tenant roles and onboarding actions, but not platform roles."],
                ["SALES", "Can create draft organizations and invite the first client contact only."],
                ["ORG_ADMIN", "Can grant tenant roles only inside their own organization."],
                ["MANAGER", "Should be unable to grant admin roles by default."],
            ],
            [42 * mm, 128 * mm],
        )
    )
    story.append(Spacer(1, 10))
    story.append(
        bullet_list(
            [
                "<b>Super Admin</b> should remain the only role that can grant platform-level power and transfer organization ownership.",
                "<b>Sales</b> should not get unrestricted client access. Best practice is to let Sales create a draft organization and nominate the first client admin, but organization activation should be confirmed by Super Admin or Platform Admin.",
                "<b>Org Admin</b> should manage all client-side users within the tenant, but must never assign platform roles or access another tenant.",
                "<b>Manager</b> should be a business role, not a security owner. Keep this role read-heavy and approval-oriented rather than account-administration heavy.",
            ],
            styles["BodyOrion"],
        )
    )

    story.append(para("4. Recommended Onboarding Flow", styles["SectionOrion"]))
    story.append(
        bullet_list(
            [
                "<b>Step 1:</b> Sales creates a prospect or client organization in Draft state.",
                "<b>Step 2:</b> Platform Admin or Super Admin reviews the account, confirms plan/billing/onboarding readiness, and activates the organization.",
                "<b>Step 3:</b> The system sends an invitation to the first client-side Org Admin.",
                "<b>Step 4:</b> The Org Admin completes setup, configures locations, devices, and any secondary tenant admins.",
                "<b>Step 5:</b> Managers, editors, and viewers are invited by Org Admin based on operational need.",
                "<b>Step 6:</b> Every invitation expires, every acceptance is logged, and every role change writes an audit trail.",
            ],
            styles["BodyOrion"],
        )
    )
    story.append(
        callout_box(
            "Best Practice",
            "Treat the first client admin as a controlled handoff moment. This is the cleanest place to separate commercial ownership from operational ownership and reduces long-term access confusion.",
            styles,
        )
    )
    story.append(Spacer(1, 10))

    story.append(para("5. Guardrails Required for Approval", styles["SectionOrion"]))
    story.append(
        bullet_list(
            [
                "Tenant isolation must be enforced in the backend, not just in the UI.",
                "Users can belong to multiple organizations only through explicit memberships.",
                "Role assignment should use permission bundles under the hood so future roles can evolve without schema breakage.",
                "Temporary support access should expire automatically and require reason logging.",
                "Sensitive changes should require dual confirmation for platform-level actions such as organization suspension, ownership transfer, or emergency content override.",
                "Audit logs should capture actor, target, action, old value, new value, timestamp, IP, and organization context.",
            ],
            styles["BodyOrion"],
        )
    )

    story.append(PageBreak())

    story.append(para("6. Data Model Recommendation", styles["SectionOrion"]))
    data_table = styled_table(
        [
            ["Entity", "Purpose"],
            ["users", "Global user identity record for login, MFA, status, and profile"],
            ["organizations", "Client tenant record with plan, status, ownership, billing, and lifecycle state"],
            ["memberships", "Join table connecting users to organizations with tenant-scoped role and status"],
            ["platform_roles", "Internal Orion staff roles such as SUPER_ADMIN, PLATFORM_ADMIN, SALES, SUPPORT"],
            ["role_permissions", "Permission bundle mapping so role behavior is configurable and auditable"],
            ["audit_logs", "Cross-platform immutable log of invites, grants, revokes, org creation, ownership changes, and support actions"],
            ["device_assignments", "Maps devices/screens to organizations and locations with assignment history"],
        ],
        [48 * mm, 122 * mm],
    )
    story.append(data_table)
    story.append(Spacer(1, 10))
    story.append(
        para(
            "This model maps directly to the stack already chosen: NestJS for domain modules, PostgreSQL for relational integrity and tenant-safe querying, Prisma for schema management, Redis for session and queue support, and BullMQ for invitation, reporting, and onboarding jobs.",
            styles["BodyOrion"],
        )
    )

    story.append(para("7. Final Recommendation to Approve", styles["SectionOrion"]))
    story.append(
        bullet_list(
            [
                "Approve a <b>two-layer RBAC model</b>: Platform roles and Organization roles.",
                "Approve <b>Super Admin as the only unrestricted access grantor</b>.",
                "Approve <b>Sales as a draft-org creator</b>, not a cross-tenant operational admin.",
                "Approve <b>Org Admin as the highest client-side authority</b> within one organization.",
                "Approve <b>Manager as a controlled operational role</b> focused on visibility and approvals.",
                "Approve <b>mandatory audit logs and time-bound support access</b> before production rollout.",
            ],
            styles["BodyOrion"],
        )
    )
    story.append(
        para(
            "If management approves this model, implementation can begin with the backend foundation in the following order: organizations, users, memberships, roles/permissions, auth, then devices and content modules.",
            styles["BodyOrion"],
        )
    )

    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    print(f"Generated {OUTPUT}")


if __name__ == "__main__":
    main()
