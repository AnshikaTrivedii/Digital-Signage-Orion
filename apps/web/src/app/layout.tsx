import AppShell from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
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
                <ThemeProvider>
                    <div className="bg-mesh"></div>
                    <div className="app-layout">
                        <AppShell>{children}</AppShell>
                    </div>
                </ThemeProvider>
            </body>
        </html>
    );
}
