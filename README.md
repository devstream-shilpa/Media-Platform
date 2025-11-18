# Media Sharing Platform

A highly available, auto-scaling media sharing platform deployed on AWS with comprehensive monitoring and disaster recovery capabilities.

![Architecture](docs/architecture-diagram.png)

## 🎯 Project Overview

This project demonstrates enterprise-grade cloud architecture by deploying a scalable media platform that meets the following requirements:

- ✅ **Elasticity**: Auto-scales 2-6 instances based on CPU utilization
- ✅ **Auto Recovery**: Multi-layered health checks with automatic failover
- ✅ **Failure Isolation**: Eliminates 5 single points of failure through redundancy
- ✅ **Performance**: Sub-second response times with CDN and caching

## 📋 Features

- **User Authentication**: JWT-based authentication with bcrypt password hashing
- **Media Upload**: Direct S3 uploads with presigned URLs
- **Async Processing**: Lambda-based media transcoding and thumbnail generation
- **Media Sharing**: Share media with other users via email notification
- **High Availability**: Deployed across 3 availability zones
- **Auto Scaling**: Handles traffic bursts automatically
- **Caching**: Redis-based caching for 80%+ cache hit rate
- **Monitoring**: Comprehensive CloudWatch metrics and alarms

## 🏗️ Architecture

### Infrastructure Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Compute** | EC2 Auto Scaling Group | Application servers (2-6 instances) |
| **Load Balancer** | Application Load Balancer | Traffic distribution & health checks |
| **Database** | RDS PostgreSQL Multi-AZ | Primary data store with read replica |
| **Cache** | ElastiCache Redis | Performance optimization layer |
| **Storage** | S3 | Media file storage with versioning |
| **CDN** | CloudFront | Global content delivery |
| **Async Processing** | Lambda + SQS | Media transcoding pipeline |
| **Monitoring** | CloudWatch + SNS | Metrics, logs, and alerts |

### Network Architecture

```
3 Availability Zones
├── Public Subnets (ALB, NAT Gateways)
└── Private Subnets (EC2, RDS, Lambda, Redis)
```

## 📦 Prerequisites

Before deploying, ensure you have:

- **AWS Account** with administrative access
- **Terraform** v1.5+ ([Download](https://developer.hashicorp.com/terraform/install))
- **AWS CLI** configured ([Setup Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html))
- **Docker** installed ([Download](https://docs.docker.com/get-docker/))
- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Git** for version control
- **PostgreSQL client** (psql) for database setup

### Verify Prerequisites

```bash
# Check versions
terraform --version  # Should be >= 1.5.0
aws --version       # AWS CLI should be configured
docker --version    # Docker should be running
node --version      # Should be >= 18.0.0
psql --version      # PostgreSQL client
```

## 🚀 Quick Start Deployment

### Option 1: Automated Deployment (Recommended)

```bash
# 1. Clone repository
git clone <your-repo-url>
cd media-platform

# 2. Configure AWS credentials
aws configure

# 3. Create SSH key pair
aws ec2 create-key-pair \
  --key-name media-platform-key \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/media-platform-key.pem
chmod 400 ~/.ssh/media-platform-key.pem

# 4. Configure Terraform variables
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
# Edit terraform.tfvars with your settings

# 5. Run deployment script
./scripts/deploy.sh
```

**Deployment Time**: ~20-25 minutes

### Option 2: Manual Step-by-Step Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed manual deployment instructions.

## 📝 Configuration

### terraform/terraform.tfvars

```hcl
aws_region         = "us-east-1"
environment        = "production"
project_name       = "media-platform"
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

# Database credentials (use strong passwords!)
db_username = "mediaadmin"
db_password = "YourSecurePassword123!"

# EC2 key pair name
key_name = "media-platform-key"

# Email for alerts
alert_email = "your-email@example.com"
```

### backend/.env

```bash
NODE_ENV=production
PORT=3000

# From Terraform outputs
DB_HOST=your-rds-endpoint.rds.amazonaws.com
DB_PORT=5432
DB_NAME=mediaplatform
DB_USER=mediaadmin
DB_PASSWORD=YourSecurePassword123!

REDIS_HOST=your-redis-endpoint.cache.amazonaws.com
REDIS_PORT=6379

S3_MEDIA_BUCKET=your-bucket-name
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/...

# Generate with: openssl rand -base64 32
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h
```

## 🧪 Testing

### 1. Health Check

```bash
ALB_DNS=$(cd terraform && terraform output -raw alb_dns_name)
curl http://$ALB_DNS/health
```

**Expected Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-17T10:30:00Z",
  "uptime": 86400,
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

### 2. User Registration

```bash
curl -X POST http://$ALB_DNS/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "password": "SecurePass123!"
  }'
```

### 3. Login and Get Token

```bash
TOKEN=$(curl -X POST http://$ALB_DNS/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }' | jq -r '.token')

echo $TOKEN
```

### 4. Upload Media

```bash
# Request upload URL
UPLOAD_DATA=$(curl -X POST http://$ALB_DNS/api/media/upload-url \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test.jpg",
    "fileType": "image/jpeg"
  }')

UPLOAD_URL=$(echo $UPLOAD_DATA | jq -r '.uploadUrl')
MEDIA_ID=$(echo $UPLOAD_DATA | jq -r '.mediaId')

# Upload file directly to S3
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: image/jpeg" \
  --upload-file test.jpg

# Confirm upload (triggers processing)
curl -X POST http://$ALB_DNS/api/media/$MEDIA_ID/confirm \
  -H "Authorization: Bearer $TOKEN"

# Check processing status
curl http://$ALB_DNS/api/media/$MEDIA_ID/status \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Load Testing (Trigger Auto Scaling)

```bash
# Run load test script
./scripts/load-test.sh

# Monitor scaling events
watch -n 5 'aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names media-platform-asg \
  --query "AutoScalingGroups[0].[DesiredCapacity,MinSize,MaxSize]"'
```

## 📊 Monitoring

### CloudWatch Dashboard

Access metrics at: **AWS Console → CloudWatch → Dashboards**

**Key Metrics**:
- Request count & latency (ALB)
- CPU utilization (EC2)
- Database connections (RDS)
- Cache hit rate (Redis)
- Lambda invocations & errors
- SQS queue depth

### View Logs

```bash
# Application logs
aws logs tail /aws/ec2/media-platform --follow

# Lambda logs
aws logs tail /aws/lambda/media-platform-media-processing --follow

# RDS slow queries
aws rds download-db-log-file-portion \
  --db-instance-identifier media-platform-db \
  --log-file-name slowquery/postgresql.log
```

### CloudWatch Alarms

Configured alarms will email alerts when:
- CPU > 70% (triggers scale up)
- CPU < 30% (triggers scale down)
- API error rate > 5%
- No healthy instances
- Lambda errors > 10 in 5 minutes

## 🔧 Operational Tasks

### Scale Manually

```bash
# Scale up
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name media-platform-asg \
  --desired-capacity 4

# Scale down
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name media-platform-asg \
  --desired-capacity 2
```

### Deploy Application Update

```bash
# Build and push new Docker image
./scripts/build-and-push.sh

# Trigger rolling update
ASG_NAME=$(cd terraform && terraform output -raw asg_name)
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name $ASG_NAME \
  --preferences MinHealthyPercentage=50
```

### Database Backup

```bash
# Create snapshot
aws rds create-db-snapshot \
  --db-instance-identifier media-platform-db \
  --db-snapshot-identifier backup-$(date +%Y%m%d)

# List snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier media-platform-db
```

### SSH to Instance

```bash
# Get instance ID
INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names media-platform-asg \
  --query "AutoScalingGroups[0].Instances[0].InstanceId" \
  --output text)

# Get public IP
PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query "Reservations[0].Instances[0].PublicIpAddress" \
  --output text)

# SSH
ssh -i ~/.ssh/media-platform-key.pem ec2-user@$PUBLIC_IP

# View Docker logs
sudo docker logs -f media-api
```

## 💰 Cost Estimation

**Monthly Operating Costs** (US East 1):

| Service | Configuration | Est. Cost |
|---------|--------------|-----------|
| EC2 (t3.medium × 3) | 730 hours/month | $100-300 |
| RDS (db.t3.medium) | Multi-AZ + replica | $150 |
| ElastiCache | cache.t3.micro | $30 |
| ALB | 2 load balancers | $40 |
| S3 + CloudFront | 1TB storage, 2TB transfer | $80 |
| Lambda | 1M invocations | $20 |
| NAT Gateway | 3 gateways | $100 |
| Data Transfer | Varies | $50 |
| **Total** | | **$570-770/month** |

**Cost Optimization Tips**:
- Use Spot Instances for non-prod (70% savings)
- Enable S3 Intelligent-Tiering
- Use single NAT Gateway for dev/test
- Delete old CloudWatch logs
- Consider Reserved Instances for production

## 🔒 Security Best Practices

- [x] Private subnets for application and database
- [x] Security groups with least privilege
- [x] Encrypted RDS storage
- [x] JWT authentication with secure secrets
- [x] Password hashing with bcrypt
- [x] HTTPS (configure SSL certificate on ALB)
- [ ] Enable AWS WAF for DDoS protection
- [ ] Use AWS Secrets Manager for credentials
- [ ] Enable VPC Flow Logs
- [ ] Configure CloudTrail for audit logging

## 🐛 Troubleshooting

### Health Checks Failing

```bash
# Check instance logs
aws logs tail /aws/ec2/media-platform --follow

# Check security group rules
aws ec2 describe-security-groups --group-ids <sg-id>

# Test from instance
ssh ec2-user@<instance-ip> "curl localhost:3000/health"
```

### Database Connection Errors

```bash
# Test connectivity
nc -zv <db-endpoint> 5432

# Check RDS status
aws rds describe-db-instances \
  --db-instance-identifier media-platform-db \
  --query "DBInstances[0].DBInstanceStatus"

# Check security group
aws ec2 describe-security-groups --group-ids <db-sg-id>
```

### Lambda Timeouts

```bash
# Check Lambda logs
aws logs tail /aws/lambda/media-platform-media-processing --follow

# Increase timeout (if needed)
aws lambda update-function-configuration \
  --function-name media-platform-media-processing \
  --timeout 600
```

### Auto Scaling Not Triggering

```bash
# Check alarm state
aws cloudwatch describe-alarms \
  --alarm-names media-platform-high-cpu

# Check Auto Scaling activity
aws autoscaling describe-scaling-activities \
  --auto-scaling-group-name media-platform-asg \
  --max-records 10
```

## 🧹 Cleanup

**⚠️ WARNING**: This will destroy ALL resources and data!

```bash
# 1. Disable RDS deletion protection
aws rds modify-db-instance \
  --db-instance-identifier media-platform-db \
  --no-deletion-protection

# 2. Empty S3 buckets
aws s3 rm s3://$(cd terraform && terraform output -raw s3_media_bucket) --recursive

# 3. Destroy infrastructure
cd terraform
terraform destroy

# Confirm by typing: yes

# 4. Delete ECR repository
aws ecr delete-repository \
  --repository-name media-api \
  --force
```

## 📚 Documentation

- [Design Document](./DESIGN.md) - Architecture and design decisions
- [API Documentation](./docs/API.md) - API endpoints and examples
- [Deployment Guide](./DEPLOYMENT.md) - Detailed deployment steps
- [Troubleshooting Guide](./docs/TROUBLESHOOTING.md) - Common issues

## 🎓 Project Requirements Met

| Requirement | Implementation | Verification |
|-------------|----------------|--------------|
| **Elasticity** | Auto Scaling Group scales 2-6 instances based on CPU | Run load test, observe scaling |
| **Auto Recovery** | ALB health checks, Multi-AZ RDS, Lambda retries | Terminate instance, watch recovery |
| **Failure Isolation** | Multi-AZ, redundant NAT, read replicas, S3 replication | Simulate AZ failure |
| **Performance** | CloudFront CDN, Redis caching, read replicas, async processing | Load test shows <200ms p95 |

## 📞 Support & Contact

For issues or questions:
1. Check [Troubleshooting Guide](./docs/TROUBLESHOOTING.md)
2. Review CloudWatch logs for errors
3. Check AWS Health Dashboard for service issues
4. Review Terraform state: `terraform show`

## 📄 License

This project is for educational purposes as part of cloud architecture coursework.

---

**Built with**: AWS, Terraform, Node.js, PostgreSQL, Redis, React  
**Last Updated**: November 2025
