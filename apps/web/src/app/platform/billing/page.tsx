export default function PlatformBillingPage() {
    return (
        <div className="glass-panel" style={{ padding: 28, display: "grid", gap: 14 }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>Billing</h1>
            <p style={{ color: "hsl(var(--text-muted))", lineHeight: 1.6 }}>
                Billing, subscriptions, invoices, and payment collections will live here. Keeping it in the platform portal makes it easier to manage client accounts without exposing internal billing operations to tenants.
            </p>
        </div>
    );
}
