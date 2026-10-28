
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";


const config = new pulumi.Config();
const adminPassword = config.requireSecret("grafanaAdminPassword");

// Namespace managed by Pulumi
const monitoringNamespace = new k8s.core.v1.Namespace(
    "monitoring-namespace",
    {
        metadata: { name: "monitoring" },
    }
);

// Deploy Prometheus and Grafana using Helm
export const monitoring = new k8s.helm.v3.Release(
    "monitoring-stack",
    {
        name: "monitoring",
        chart: "kube-prometheus-stack",
        version: "92.10.1",
        namespace: monitoringNamespace.metadata.name,
        repositoryOpts: {
            repo: "https://prometheus-community.github.io/helm-charts",
        },
        values: {
            grafana: {
                adminUser: "admin",
                adminPassword: adminPassword,
                service: {
                    type: "NodePort",
                    nodePort: 30030,
                },
            },
            prometheus: {
                prometheusSpec: {
                    // Discover our custom ServiceMonitor
                    // in the default namespace
                    serviceMonitorSelectorNilUsesHelmValues: false,
                    serviceMonitorSelector: {},
                    serviceMonitorNamespaceSelector: {},
                },
            },
        },
    },
    { dependsOn: monitoringNamespace }
);

// Outputs required by the exercise
export const grafanaUrl = "http://localhost:30030";
export const grafanaAdminUser = "admin";
export const grafanaAdminPassword = adminPassword;



const redisServiceMonitor =
    new k8s.apiextensions.CustomResource(
        "redis-service-monitor",
        {
            apiVersion: "monitoring.coreos.com/v1",
            kind: "ServiceMonitor",
            metadata: {
                name: "redis-guestbook",
                namespace: "default",
            },
            spec: {
                selector: {
                    matchLabels: {
                        monitoring: "redis",
                    },
                },
                namespaceSelector: {
                    matchNames: ["default"],
                },
                endpoints: [
                    {
                        port: "metrics",
                        path: "/metrics",
                        interval: "30s",
                    },
                ],
            },
        },
        {
            dependsOn: [monitoring],
        }
    );

    