import * as k8s from "@pulumi/kubernetes";
import * as fs from "fs";
import * as path from "path";
import { monitoring } from "./monitoring";

// The kube-prometheus-stack Grafana sidecar imports labeled ConfigMaps.
// Its default Prometheus datasource UID is "prometheus".
const dashboardJson = fs.readFileSync(
    path.join(__dirname, "dashboards", "guestbook.json"),
    "utf8",
);

export const guestbookDashboard = new k8s.core.v1.ConfigMap(
    "guestbook-dashboard",
    {
        metadata: {
            name: "guestbook-dashboard",
            namespace: "monitoring",
            labels: {
                grafana_dashboard: "1",
            },
        },
        data: {
            "guestbook.json": dashboardJson,
        },
    },
    { dependsOn: [monitoring] },
);
