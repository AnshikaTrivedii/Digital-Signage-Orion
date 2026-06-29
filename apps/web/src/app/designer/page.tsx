import { LegacyRouteRedirect } from "@/components/shared/LegacyRouteRedirect";
import { LAYOUT_DESIGNER_ENABLED } from "@/lib/feature-flags";

export default function LegacyDesignerRedirect() {
    return (
        <LegacyRouteRedirect
            href={LAYOUT_DESIGNER_ENABLED ? "/app/designer" : "/app/dashboard"}
            label="client designer"
        />
    );
}
