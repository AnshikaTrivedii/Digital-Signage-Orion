"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "dark" | "light";

type ThemeContextValue = {
    theme: Theme;
    toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "orion-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>("dark");

    useEffect(() => {
        const storedTheme = window.localStorage.getItem(STORAGE_KEY);
        const initialTheme: Theme = storedTheme === "light" ? "light" : "dark";
        setTheme(initialTheme);
        document.documentElement.dataset.theme = initialTheme;
    }, []);

    const value = useMemo(
        () => ({
            theme,
            toggleTheme: () => {
                const nextTheme: Theme = theme === "dark" ? "light" : "dark";
                setTheme(nextTheme);
                document.documentElement.dataset.theme = nextTheme;
                window.localStorage.setItem(STORAGE_KEY, nextTheme);
            },
        }),
        [theme],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within ThemeProvider");
    }
    return context;
}
