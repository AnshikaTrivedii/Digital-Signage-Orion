declare module "leaflet.markercluster";

import "leaflet";

declare module "leaflet" {
    function markerClusterGroup(options?: Record<string, unknown>): MarkerClusterGroup;

    interface MarkerClusterGroup extends FeatureGroup {
        refreshClusters(): this;
        getChildCount(): number;
    }
}

export {};
