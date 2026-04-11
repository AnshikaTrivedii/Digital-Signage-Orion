"use client";

export function ReadOnlyNotice({ message }: { message: string }) {
    return (
        <div
            className="glass-panel"
            style={{
                padding: 14,
                marginBottom: 20,
                border: "1px solid hsla(var(--status-warning), 0.24)",
                background: "hsla(var(--status-warning), 0.08)",
                color: "hsl(var(--text-secondary))",
                fontSize: "0.84rem",
            }}
        >
            {message}
        </div>
    );
}
