# Deployment Process & Change Control

## Overview
This document outlines the deployment strategy and change control process for the Media Platform infrastructure.

## Environments

### 1. Development (dev)
- **Purpose:** Feature development and testing
- **Deployment:** Automatic on merge to `main` branch
- **Approval:** Not required
- **Infrastructure:** Smaller instance sizes, single-AZ database
- **Access:** Development team

### 2. Staging (staging)
- **Purpose:** Pre-production testing and validation
- **Deployment:** Manual approval required
- **Approval:** Lead Developer or Tech Lead
- **Infrastructure:** Production-like configuration
- **Access:** QA team, Development team

### 3. Production (prod)
- **Purpose:** Live customer-facing environment
- **Deployment:** Manual approval required (2-person review)
- **Approval:** Tech Lead + DevOps Lead (both required)
- **Change Window:** Tuesday/Thursday 2-4 AM EST
- **Infrastructure:** Multi-AZ, high availability
- **Access:** Operations team only

---

## Change Control Process

### Step 1: Development
1. Create feature branch from `main`
2. Make infrastructure changes in `terraform/` directory
3. Test locally with `terraform plan`
4. Commit changes with descriptive commit message

### Step 2: Code Review
1. Open Pull Request to `main`
2. Automated checks run:
   - Terraform format validation
   - Terraform validate
   - Security scan (tfsec)
   - Terraform plan
3. At least 1 reviewer approval required
4. All CI checks must pass

### Step 3: Merge to Main (Dev Deployment)
1. PR merged to `main` branch
2. Changes automatically deployed to **dev** environment
3. Automated tests run
4. Team notified via Slack/Email

### Step 4: Staging Deployment
1. Manual trigger via GitHub Actions
2. Requires approval from Tech Lead
3. Deployment executed
4. QA team performs validation tests
5. Smoke tests must pass

### Step 5: Production Deployment
1. Create deployment ticket with:
   - Change description
   - Risk assessment
   - Rollback plan
   - Testing evidence from staging
2. Schedule deployment during change window
3. Requires approval from:
   - Tech Lead (approval 1)
   - DevOps Lead (approval 2)
4. Manual trigger via GitHub Actions
5. Execute deployment
6. Monitor CloudWatch metrics for 1 hour
7. Verify application health
8. Update deployment ticket as complete

---

## Deployment Commands

### Dev Environment
```bash
cd terraform
terraform workspace select dev
terraform plan -var-file=environments/dev/terraform.tfvars
terraform apply -var-file=environments/dev/terraform.tfvars
```

### Staging Environment
```bash
cd terraform
terraform workspace select staging
terraform plan -var-file=environments/staging/terraform.tfvars
# Wait for approval
terraform apply -var-file=environments/staging/terraform.tfvars
```

### Production Environment
```bash
cd terraform
terraform workspace select prod
terraform plan -var-file=environments/prod/terraform.tfvars
# Wait for 2-person approval
terraform apply -var-file=environments/prod/terraform.tfvars
```

---

## Rollback Procedure

### Immediate Rollback (< 1 hour)
1. Identify the last known good state
2. Execute: `terraform apply` with previous `.tfvars` or state
3. Verify application functionality
4. Post-mortem within 24 hours

### Planned Rollback (> 1 hour)
1. Create rollback PR
2. Follow normal change control process
3. Schedule during next change window

---

## Emergency Changes

For critical security issues or production outages:
1. Create emergency change ticket
2. Notify Tech Lead and DevOps Lead immediately
3. Implement fix with single approval
4. Deploy to production
5. Post-deployment review within 24 hours

---

## Monitoring & Alerts

All deployments are monitored via:
- CloudWatch Dashboards
- SNS Alerts to on-call team
- Application health checks
- Database connection metrics

**Post-Deployment Checklist:**
- [ ] All EC2 instances healthy
- [ ] Database connections stable
- [ ] Redis cache responding
- [ ] S3 uploads working
- [ ] Lambda processing queue
- [ ] No elevated error rates
- [ ] Response times within SLA

---

## Audit & Compliance

- All infrastructure changes tracked in Git
- Terraform state stored in S3 with versioning
- CloudTrail logs all AWS API calls
- Deployment history visible in GitHub Actions
- Tags on all resources for cost tracking
