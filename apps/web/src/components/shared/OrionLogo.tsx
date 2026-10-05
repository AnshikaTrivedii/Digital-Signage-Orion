import Image from "next/image";

const FULL_LOGO = { src: "/spectra-logo.png", width: 916, height: 503 };
const MARK_LOGO = { src: "/spectra-mark.png", width: 273, height: 471 };

type OrionLogoProps = {
    height?: number;
    className?: string;
    priority?: boolean;
    /** Ribbon mark only, for the collapsed sidebar. */
    mark?: boolean;
};

export function OrionLogo({ height = 56, className, priority = false, mark = false }: OrionLogoProps) {
    const logo = mark ? MARK_LOGO : FULL_LOGO;
    const width = Math.round(height * (logo.width / logo.height));

    return (
        <Image
            src={logo.src}
            alt="Spectra"
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
