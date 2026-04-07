import { LegacyRouteRedirect } from "@/components/shared/LegacyRouteRedirect";

export default function LegacyTickersRedirect() {
    return <LegacyRouteRedirect href="/app/tickers" label="client tickers" />;
}
