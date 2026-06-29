import Image from "next/image";

/** Natural dimensions of `/public/orion-logo.png` */
const LOGO_WIDTH = 513;
const LOGO_HEIGHT = 542;

type OrionLogoProps = {
    height?: number;
    className?: string;
    priority?: boolean;
};

export function OrionLogo({ height = 72, className, priority = false }: OrionLogoProps) {
    const width = Math.round(height * (LOGO_WIDTH / LOGO_HEIGHT));

    return (
        <Image
            src="/orion-logo.png"
            alt="Orion LED"
            width={width}
            height={height}
            priority={priority}
            className={className}
            style={{
                width,
                height,
                maxWidth: "100%",
                objectFit: "contain",
                display: "block",
            }}
        />
    );
}
