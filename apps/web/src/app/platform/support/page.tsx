export default function PlatformSupportPage() {
    return (
        <div className="glass-panel" style={{ padding: 28, display: "grid", gap: 14 }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>Support</h1>
            <p style={{ color: "hsl(var(--text-muted))", lineHeight: 1.6 }}>
                This section is reserved for support tooling such as client health views, support notes, incident tracking, and temporary elevated access workflows.
            </p>
        </div>
    );
}
