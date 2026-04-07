import { LegacyRouteRedirect } from "@/components/shared/LegacyRouteRedirect";

export default function LegacyPlaylistsRedirect() {
    return <LegacyRouteRedirect href="/app/playlists" label="client playlists" />;
}
