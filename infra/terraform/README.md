# ShelfOps AWS infrastructure (Terraform, ephemeral, ~USD 0)

Reproducible AWS environment for the ShelfOps API. `terraform apply` brings up
CloudFront → ALB → ECS Fargate → RDS PostgreSQL, and `terraform destroy` tears it
down. It is designed to be **ephemeral**: bring it up for a demo, then destroy it
the same day. Nothing here is a 24/7 production deployment.

> **Cost warning.** RDS and the ALB bill by the hour even with no traffic. Always
> run `terraform destroy` after a demo and verify there are no leftover resources.
> Create the USD 1 budget before the first real apply.

## Architecture

```mermaid
flowchart LR
  Viewer([Viewer]) -->|HTTPS| CF["CloudFront<br/>default *.cloudfront.net cert"]
  CF -->|"HTTP + X-Origin-Verify"| ALB["Application Load Balancer<br/>public subnets, 2 AZ"]
  ALB --> TG["Target group :3000<br/>health check /ready"]
  TG --> Task["ECS Fargate task<br/>0.25 vCPU / 0.5 GB"]
  Task -->|"TLS verify-full"| RDS[("RDS PostgreSQL 16<br/>db.t4g.micro single-AZ")]
  Task -->|GetSecretValue| SM[Secrets Manager]
  Task -->|awslogs| CW[CloudWatch Logs 7d]
  Task -->|"docker pull"| ECR[ECR]
  ECR -.->|"image"| Task

  subgraph VPC["VPC 10.20.0.0/16 — no NAT gateway"]
    ALB
    TG
    Task
    RDS
  end
```

Trust boundaries:

- The ALB security group accepts port 80 **only** from the CloudFront
  `com.amazonaws.global.cloudfront.origin-facing` managed prefix list, and the
  listener only forwards requests carrying the generated `X-Origin-Verify`
  header. Everything else gets `403`.
- The task security group accepts its container port **only** from the ALB.
- The RDS security group accepts 5432 **only** from the task. RDS runs in private
  subnets with `rds.force_ssl = 1`; the API uses `DATABASE_SSL_MODE=verify-full`
  with the RDS CA bundle baked into the image.
- There is **no NAT gateway**. Fargate tasks sit in public subnets and receive a
  public IP through the ECS `assignPublicIp` setting; the security groups above
  keep them unreachable except from the ALB.

## Modules

| Module | Resources |
| --- | --- |
| `modules/network` | VPC, 2 public + 2 private subnets, IGW, route tables, ALB/task security groups, stripped default security group |
| `modules/database` | DB subnet group, database security group, `postgres16` parameter group, encrypted `db.t4g.micro` instance |
| `modules/compute` | ECR, ECS cluster/service, least-privilege task + execution roles, log group, one-off task definition |
| `modules/ingress` | CloudFront distribution, ALB, target group, secret origin header, listener rule |
| `modules/secrets` | Secrets Manager secrets (`DATABASE_URL`, `CURSOR_SECRET`, `METRICS_BEARER_TOKEN`, OIDC client secret) |
| `modules/observability` | SNS alarm topic, ALB/ECS/RDS alarms, CloudWatch dashboard |
| `modules/budgets` | Optional AWS Budgets USD alert |

Roots: `bootstrap/` (state bucket) and `envs/demo/` (the stack).

## Prerequisites

- Terraform >= 1.10 (S3 native lockfile), AWS CLI v2, Docker.
- AWS credentials for a real apply. Never commit them; all resources are created
  from the CLI or CI with short-lived credentials.

## Local development with LocalStack (no AWS spend)

The free LocalStack tier does **not** emulate ECR, ECS, RDS, ELBv2 or CloudFront
— they require a paid plan (see [LocalStack findings](#localstack-findings)). The
`localstack` flag disables those modules so the supported subset still applies:

```sh
cd infra/terraform/envs/demo
terraform init -backend=false
terraform apply -var 'localstack=true'   # secrets + observability only
terraform destroy -var 'localstack=true'
```

Run LocalStack itself with Docker, for example:

```sh
docker run -d --name localstack -p 4566:4566 \
  -e SERVICES=s3,secretsmanager,sns,cloudwatch,logs,iam,sts,kms \
  localstack/localstack:4.4.0
```

### LocalStack findings

Verified against <https://docs.localstack.cloud/aws/licensing/> and the
per-service coverage pages, then exercised locally:

- **Free Hobby plan:** ECR ❌, ECS ❌, RDS ❌, ELBv2 ❌, CloudFront ❌ (all Base+);
  Secrets Manager ✅, SNS ✅, CloudWatch metrics/logs ✅, S3 ✅, IAM ✅, KMS ✅.
  AWS Budgets has no coverage page and is not emulated.
- **Since LocalStack 2026.03.0 an auth token is required** to start any image.
  `localstack/localstack:latest` (2026.8.5) exits with code 55:
  `License activation failed ... No credentials were found`.
- Exercised end-to-end with the last token-free community image
  `localstack/localstack:4.4.0` (`edition: community`):
  - `bootstrap` → 7 resources added (versioned, encrypted, TLS-only S3 bucket),
    destroyed cleanly even with a versioned object present.
  - `envs/demo -var localstack=true` → 10 resources added (Secrets Manager
    secrets + versions, SNS topic, CloudWatch dashboard, guard), destroyed
    cleanly; the backend state file lived in the LocalStack S3 bucket.
  - **Not exercised:** network/DNS, RDS, ECR, ECS/Fargate, ALB and CloudFront.
    Those are only validated statically (`terraform validate`, tflint, checkov).

## Real AWS demo procedure

```sh
# 0. Budget: create the USD 1 budget first (or reuse the account's existing one).
cd infra/terraform
terraform -chdir=bootstrap init
terraform -chdir=bootstrap apply -var 'state_bucket_name=shelfops-tfstate-<ACCOUNT-ID>'
```

```sh
# 1. Configure the demo root with the state bucket from step 0.
cd envs/demo
cp backend.hcl.example backend.hcl          # fill bucket/region, never commit
terraform init -backend-config=backend.hcl
terraform apply -var 'container_image=placeholder'  # first apply creates ECR
```

```sh
# 2. Build and push the image to the ECR repository Terraform created.
ECR=$(terraform output -raw ecr_repository_url)
aws ecr get-login-password | docker login --username AWS --password-stdin "${ECR%%/*}"
docker build --platform linux/amd64 -f ../../../Dockerfile.api -t "$ECR:$(git rev-parse --short HEAD)" ../../..
docker push "$ECR:$(git rev-parse --short HEAD)"
terraform apply -var "container_image=$ECR:$(git rev-parse --short HEAD)"
```

```sh
# 3. Run migrations, then the tenant bootstrap, as one-off ECS tasks.
eval "$(terraform output -raw migrate_task_command)"
eval "$(terraform output -raw seed_tenant_task_command)"   # fill the <placeholders>
```

```sh
# 4. Smoke test through CloudFront (first distribution deployment can take a few minutes).
curl --fail "$(terraform output -raw smoke_url)"     # expect {"status":"ready"}
```

```sh
# 5. Tear down and verify nothing is left.
terraform destroy
terraform -chdir=../bootstrap destroy -var 'state_bucket_name=shelfops-tfstate-<ACCOUNT-ID>'
aws ecs list-clusters
aws rds describe-db-instances --query 'DBInstances[].DBInstanceIdentifier'
aws elbv2 describe-load-balancers --query 'LoadBalancers[].LoadBalancerName'
aws cloudfront list-distributions --query 'DistributionList.Items[].Id'
```

A forced 5xx alarm email can be triggered by requesting a path that makes the API
return 503 (for example by scaling the service to zero tasks while the target
group health check fails); the SNS subscription must be confirmed by email first.

## TRUST_PROXY finding

CloudFront appends the viewer address to `X-Forwarded-For` and the ALB appends
the CloudFront address, so the API sees **two** trusted proxy hops. With
`TRUST_PROXY=1` the API would resolve the CloudFront IP instead of the real
client and rate limiting would bucket every viewer together. The demo root sets
`TRUST_PROXY=2` (`var.trust_proxy_hops`). Behind an ALB only, use `1`; directly
exposed, use `false`.

## Estimated cost (24/7, us-east-1, on-demand)

All figures are **estimates** from the public AWS on-demand pricing pages,
rounded, excluding taxes, free-tier credits and data transfer beyond the free
allowance. 730 hours/month.

| Resource | Configuration | Hourly | Monthly (730 h) |
| --- | --- | --- | --- |
| RDS instance | `db.t4g.micro`, single-AZ, PostgreSQL 16 | ~$0.0163 | ~$11.90 |
| RDS storage | 20 GB gp3 + 1 day backups | — | ~$2.30 |
| Application Load Balancer | 1 ALB, minimal LCU | ~$0.0225 + LCU | ~$17.00–20.00 |
| ECS Fargate | 1 task, 0.25 vCPU / 0.5 GB | ~$0.0123 | ~$9.00 |
| Secrets Manager | 4 secrets | — | ~$1.60 |
| ECR | <1 GB image | — | ~$0.05 |
| S3 state | a few KB | — | <$0.01 |
| CloudFront | PriceClass_100, low volume | — | $0.00–2.00 |
| CloudWatch Logs/alarms/dashboard | 7-day logs, ~7 alarms, 1 dashboard | — | $0.00 (free tier) |
| SNS email | a few emails | — | $0.00 |
| Public IPv4 addresses | 2 for the ALB + 1 for the Fargate task, $0.005/h each | ~$0.015 | ~$11.00 |
| **Total** | | | **~$53–59/month** |

**Conscious omissions** that keep it cheap: no NAT gateway (~$32/month saved), no
WAF (~$5+/month), no VPC endpoints (~$7+/month each), no Multi-AZ, no
Performance Insights, no KMS customer-managed keys, CloudFront without custom
domain/ACM.

**Actual demo cost:** the hourly resources sum to roughly **$0.08/hour**, so a
four-hour demo costs about **$0.32**, plus a few cents of prorated monthly
storage/secret charges. This is well within AWS free-plan credits, but verify the
account's current terms before applying.

## Production variant (conscious cost decision)

The demo runs tasks in public subnets with a public IP and keeps RDS private. For
a production deployment:

- Move Fargate tasks to **private subnets** and add either a **NAT gateway**
  (~$32/month + data) or **VPC endpoints** for ECR, S3, CloudWatch Logs, Secrets
  Manager and RDS.
- Enable **Multi-AZ** RDS, longer backup retention, deletion protection and a
  customer-managed KMS key.
- Put **WAF** in front of CloudFront/ALB and add **ALB access logs**.
- Use a purchased domain with an **ACM certificate** and a CloudFront alias
  instead of the default certificate.
- Keep the Terraform modules; only the root variables and the `enable_*` flags
  change.

## Terraform state

- `bootstrap/` creates a versioned, AES256-encrypted, TLS-only S3 bucket with
  `force_destroy = true` so `destroy` also removes the demo state file. It uses
  local state itself.
- `envs/demo/` uses a partial S3 backend with native S3 lockfile (`use_lockfile =
  true`), configured through `backend.hcl` (copy of `backend.hcl.example`). No
  account id is committed.

## Budgets

The demo can create a USD 1 monthly budget (`enable_budget = true`,
`alarm_email`). The account already has a budget named **"My Zero-Spend Budget"**,
so leave `enable_budget = false` to avoid a duplicate; the module is optional and
skipped automatically under LocalStack.

## Verification status

- `terraform fmt -check -recursive`, `terraform validate` (both roots), `tflint`
  and `checkov` are green and run in `.github/workflows/infra.yml` without AWS
  credentials. Checkov's deliberate cost skips are documented in
  `infra/terraform/.checkov.yaml`.
- The LocalStack subset applies and destroys cleanly (see
  [LocalStack findings](#localstack-findings)).
- **Not yet verified against real AWS:** CloudFront/ALB wiring, ECS task
  startup, RDS TLS `verify-full` against the real RDS endpoint, alarm email
  delivery, and the full apply under 20 minutes. Those require a human-approved
  apply with real credentials.
