# Kubernetes Guestbook Monitoring with Pulumi

## Overview

This project extends the official [Pulumi Kubernetes Guestbook example](https://github.com/pulumi/examples/tree/master/kubernetes-ts-guestbook/simple) with monitoring and observability capabilities.

The infrastructure is provisioned using **Pulumi (TypeScript)** and runs on a local Kubernetes cluster created with Kind.

### Features

- Kubernetes Guestbook application with Redis leader and replica
- Prometheus and Grafana deployed using Pulumi and Helm
- Redis Exporter for Redis performance metrics
- Traefik Ingress Controller for HTTP traffic and request metrics
- Prometheus ServiceMonitor resources for metric discovery
- Grafana dashboard for application performance monitoring
- Grafana access details exported through Pulumi

## Architecture

The application consists of three tiers:

1. **Frontend:** Three replicas of the Guestbook PHP application.
2. **Redis leader:** Handles application writes.
3. **Redis replica:** Replicates data from the leader and serves reads.

Monitoring components:

- **Prometheus:** Collects metrics from Kubernetes, Redis Exporter, and Traefik.
- **Grafana:** Visualizes application and infrastructure metrics.
- **Traefik:** Routes external HTTP traffic to the Guestbook frontend and exposes HTTP request metrics.

All Kubernetes and monitoring resources are managed using Pulumi.

## Prerequisites

The following tools must be installed:

| Tool | Purpose |
|---|---|
| Docker Desktop | Container runtime |
| Kind | Local Kubernetes cluster |
| kubectl | Kubernetes management |
| Pulumi CLI | Infrastructure provisioning |
| Node.js and npm | TypeScript dependencies |
| Helm CLI | Optional chart inspection and troubleshooting |

On macOS, install the command-line tools using Homebrew:

```bash
brew install kind kubectl pulumi node helm
```

Install and start Docker Desktop separately.

Verify the tools:

```bash
docker info
kind version
kubectl version --client
pulumi version
node --version
```

Allocate approximately 6–8 GB of memory to Docker Desktop if available.

## Deployment Instructions

### 1. Clone the repository

```bash
git clone https://github.com/Badger100/guestbook-monitoring

cd pulumi-guestbook-monitoring
```



### 2. Create the Kubernetes cluster

The project includes `kind-config.yaml`, which configures a local Kubernetes cluster and maps port `30030` for Grafana access.

```bash
kind create cluster \
  --name guestbook \
  --config kind-config.yaml
```

Configure the Kubernetes context:

```bash
kubectl config use-context kind-guestbook
kubectl get nodes
```

Ensure the node is in the `Ready` state.

### 3. Install project dependencies

```bash
npm install
```

### 4. Initialize Pulumi

Use the local Pulumi backend:

```bash
pulumi login --local
pulumi stack init dev
```

If a `dev` stack already exists locally, select it instead:

```bash
pulumi stack select dev
```

Configure the original Guestbook example to avoid creating a cloud LoadBalancer:

```bash
pulumi config set isMinikube true
```

This setting also works for the Kind deployment because it configures the original Guestbook frontend Service as `ClusterIP`.

Configure the Grafana admin password:

```bash
pulumi config set --secret grafanaAdminPassword \
  "$(openssl rand -hex 18)"
```

The Grafana password is stored as a Pulumi secret, not hardcoded in the source files.

### 5. Deploy the infrastructure

Validate the TypeScript project:

```bash
npx tsc --noEmit
```

Preview the planned resources:

```bash
pulumi preview
```

Deploy:

```bash
pulumi up
```

Review the proposed infrastructure changes and approve them.

Pulumi deploys the Guestbook application, Redis Exporters, Prometheus, Grafana, Traefik, and associated Kubernetes monitoring resources.

### 6. Verify the deployment

Check all pods:

```bash
kubectl get pods -A
```

Check Services and Ingress:

```bash
kubectl get svc -A
kubectl get ingress -A
```

Check ServiceMonitors:

```bash
kubectl get servicemonitor -A
```

All required pods should be running and ready.

On Kind, the Ingress may have no external address. Traefik is accessed using Kubernetes port-forwarding.

## Application Access

### Guestbook via Traefik

Forward Traefik's HTTP port:

```bash
kubectl -n traefik port-forward svc/traefik 8081:80
```

Open:

http://localhost:8081

Submit a Guestbook message and refresh the page to verify that it persists.

### Grafana

Grafana is exposed through NodePort `30030`.

Open:

http://localhost:30030

Alternatively:

```bash
kubectl -n monitoring port-forward \
  svc/monitoring-grafana 3000:80
```

Then open http://localhost:3000.

**Admin username:** `admin`

Retrieve the password:

```bash
pulumi stack output --show-secrets grafanaAdminPassword
```

The password is intentionally not included in this README.

The Grafana URL and admin username can be retrieved using:

```bash
pulumi stack output grafanaUrl
pulumi stack output grafanaAdminUser
```

### Prometheus

```bash
kubectl -n monitoring port-forward \
  svc/monitoring-kube-prometheus-prometheus 9090:9090
```

Open:

http://localhost:9090

## Monitoring and Verification

### 1. Verify Prometheus scrape targets

Open:

http://localhost:9090/targets

Verify that the Redis Exporter, Traefik, and relevant Kubernetes monitoring targets report `UP`.

Query:

```promql
up
```

A value of `1` indicates a healthy scrape target.

### 2. Verify Redis metrics

Use the Prometheus expression browser:

```promql
redis_up
```

Expected result for healthy Redis Exporter targets:

```text
redis_up = 1
```

Additional queries:

**Redis memory usage**

```promql
redis_memory_used_bytes
```

**Redis operations per second**

```promql
rate(redis_commands_processed_total[5m])
```

### 3. Verify HTTP request metrics

Ensure traffic passes through Traefik on port `8081`, rather than the frontend Service directly.

Generate 100 HTTP requests:

```bash
for i in {1..100}; do
  curl -s -o /dev/null http://localhost:8081/
done
```

Query the Traefik request counter:

```promql
traefik_router_requests_total
```

HTTP request rate:

```promql
sum by (router, code) (
  rate(traefik_router_requests_total[5m])
)
```

HTTP 5xx error percentage for the Guestbook router:

```promql
100 *
(
  sum(rate(traefik_router_requests_total{
    router=~".*guestbook.*",
    code=~"5.."
  }[5m])) or vector(0)
)
/
clamp_min(
  sum(rate(traefik_router_requests_total{
    router=~".*guestbook.*"
  }[5m])),
  0.001
)
```

Verify that the actual router label matches the filter.

### 4. Verify frontend CPU and memory

**CPU usage in cores:**

```promql
sum by (pod) (
  rate(container_cpu_usage_seconds_total{
    namespace="default",
    container="frontend"
  }[5m])
)
```

**Memory usage in bytes:**

```promql
sum by (pod) (
  container_memory_working_set_bytes{
    namespace="default",
    container="frontend"
  }
)
```

These metrics come from Kubernetes kubelet/cAdvisor scraping.

## Grafana Dashboard

The project includes a Guestbook monitoring dashboard with panels for:

- HTTP requests per second
- HTTP 5xx error percentage
- Frontend CPU usage
- Frontend memory usage
- Redis availability
- Redis operations per second

The dashboard is defined in `dashboards/guestbook.json` and provisioned through a Kubernetes ConfigMap managed by Pulumi.

To view it:

1. Open Grafana.
2. Navigate to **Dashboards**.
3. Select **Guestbook Application Monitoring**.
4. Set the time range to the last 30 minutes.
5. Generate application requests and observe the metrics.

Dashboard panels display real Prometheus data. Some rate metrics may require several minutes of collected samples before displaying meaningful values.

## Redis Replication Verification

Find Redis pods:

```bash
kubectl get pods -l app=redis-leader
kubectl get pods -l app=redis-replica
```

Get the running pod names:

```bash
LEADER=$(kubectl get pods \
  -l app=redis-leader \
  -o jsonpath='{.items[0].metadata.name}')

REPLICA=$(kubectl get pods \
  -l app=redis-replica \
  -o jsonpath='{.items[0].metadata.name}')
```

Check replication:

```bash
kubectl exec "$REPLICA" -c replica -- \
  redis-cli INFO replication
```

Expected output includes:

```text
master_link_status:up
master_sync_in_progress:0
```

Check database key counts:

```bash
kubectl exec "$LEADER" -c redis-leader -- \
  redis-cli DBSIZE

kubectl exec "$REPLICA" -c replica -- \
  redis-cli DBSIZE
```

After synchronization, both instances should contain the same replicated keys.

### Redis version compatibility

The original Guestbook example uses different Redis container images for its leader and replica. The replica configuration has been updated to use a compatible Redis version because incompatible RDB formats can prevent replication.

The Redis Exporter runs as a sidecar in the Redis pods.

## Troubleshooting

**Pods not running**

```bash
kubectl get pods -A
kubectl describe pod <pod-name> -n <namespace>
kubectl logs <pod-name> -n <namespace>
```

**Prometheus targets missing**

```bash
kubectl get servicemonitor -A
kubectl get svc -A
```

Check Service labels, ServiceMonitor selectors, metrics ports, and Prometheus namespace selectors.

**Grafana dashboard shows No data**

Verify the Prometheus data source, run the panel's PromQL query directly in Prometheus, and confirm the target is being scraped.

**Guestbook messages disappear**

Check Redis replication using `INFO replication` and inspect the Redis replica logs.

## Cleanup

Destroy the Pulumi-managed resources:

```bash
pulumi destroy
```

Optionally remove the Pulumi stack:

```bash
pulumi stack rm dev
```

Delete the local Kubernetes cluster:

```bash
kind delete cluster --name guestbook
```

## Limitations

This deployment is designed as a local coding exercise and demonstration, not a production-ready Kubernetes environment.

- The Redis application data is not configured for durable production persistence.
- Grafana is exposed locally rather than through a public HTTPS endpoint.
- Monitoring storage and retention settings are intended for development.
- Application HTTP metrics are collected at the Traefik Ingress layer rather than through native PHP application instrumentation.

For production use, additional work would include persistent storage, authentication, TLS, resource tuning, high availability, and backup and recovery policies.

## References

- [Pulumi Kubernetes Guestbook](https://github.com/pulumi/examples/tree/master/kubernetes-ts-guestbook/simple)
- [Pulumi Kubernetes Provider](https://www.pulumi.com/registry/packages/kubernetes/)
- [Prometheus](https://prometheus.io/)
- [Grafana](https://grafana.com/docs/grafana/latest/)
- [Traefik](https://doc.traefik.io/traefik/)
- [Redis Exporter](https://github.com/oliver006/redis_exporter)

## Attribution

Based on the original Kubernetes Guestbook Pulumi example by Pulumi Corporation. Extended with monitoring infrastructure as part of the 4IR Solutions Senior Site Reliability Engineer coding exercise.