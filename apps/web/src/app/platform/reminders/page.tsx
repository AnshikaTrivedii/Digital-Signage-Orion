export default function PlatformRemindersPage() {
    return (
        <div className="glass-panel" style={{ padding: 28, display: "grid", gap: 14 }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>Reminders</h1>
            <p style={{ color: "hsl(var(--text-muted))", lineHeight: 1.6 }}>
                This is the future home for onboarding reminders, payment follow-ups, invite nudges, and renewal notifications. It is scaffolded separately now so those workflows stay out of the client-facing CMS.
            </p>
        </div>
    );
}
