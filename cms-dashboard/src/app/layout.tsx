import AppShell from "@/components/AppShell";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Orion-Led CMS Dashboard",
    description: "Enterprise Digital Signage System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>
                <div className="bg-mesh"></div>
                <div className="app-layout">
                    <AppShell>{children}</AppShell>
                </div>
            </body>
        </html>
    );
}
