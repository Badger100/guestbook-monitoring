
import * as k8s from "@pulumi/kubernetes";
import { monitoring } from "./monitoring";

// Traefik namespace
const traefikNamespace = new k8s.core.v1.Namespace(
    "traefik-namespace",
    {
        metadata: {
            name: "traefik",
        },
    }
);

// Deploy Traefik using Helm
export const traefik = new k8s.helm.v3.Release(
    "traefik",
    {
        name: "traefik",
        chart: "traefik",
        version: "42.1.3",
        repositoryOpts: {
            repo: "https://traefik.github.io/charts",
        },
        namespace: traefikNamespace.metadata.name,

        values: {
            // Kind does not provide a LoadBalancer by default
            service: {
                spec: {
                    type: "ClusterIP",
                },
            },

            // Kubernetes IngressClass
            ingressClass: {
                enabled: true,
                isDefaultClass: false,
                name: "traefik",
            },

            // Enable Kubernetes Ingress provider
            providers: {
                kubernetesIngress: {
                    enabled: true,
                },
                kubernetesCRD: {
                    enabled: false,
                },
                kubernetesGateway: {
                    enabled: false,
                },
            },

            // Prometheus metrics
            metrics: {
                prometheus: {
                    addRoutersLabels: true,
                    addServicesLabels: true,

                    service: {
                        enabled: true,
                    },

                    serviceMonitor: {
                        enabled: true,
                        interval: "30s",
                        additionalLabels: {
                            release: "monitoring",
                        },
                    },
                },
            },
        },
    },
    {
        dependsOn: [
            traefikNamespace,
            monitoring,
        ],
    }
);

// Route HTTP requests to Guestbook frontend
export const guestbookIngress =
    new k8s.networking.v1.Ingress(
        "guestbook-ingress",
        {
            metadata: {
                name: "guestbook",
                namespace: "default",
                annotations: {
                    "pulumi.com/skipAwait": "true",}
            },

            spec: {
                ingressClassName: "traefik",

                rules: [
                    {
                        http: {
                            paths: [
                                {
                                    path: "/",
                                    pathType: "Prefix",

                                    backend: {
                                        service: {
                                            name: "frontend",
                                            port: {
                                                number: 80,
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
        },
        {
            dependsOn: [traefik],
        }
    );
