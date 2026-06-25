import Image from "next/image";

type OrionLogoProps = {
    height?: number;
    className?: string;
    priority?: boolean;
};

export function OrionLogo({ height = 72, className, priority = false }: OrionLogoProps) {
    return (
        <Image
            src="/orion-logo.png"
            alt="Orion LED"
            width={Math.round(height * 0.48)}
            height={height}
            priority={priority}
            className={className}
            style={{ height, width: "auto", maxWidth: "100%", objectFit: "contain", display: "block" }}
        />
    );
}
