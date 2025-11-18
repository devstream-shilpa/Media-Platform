
#!/bin/bash
# terraform/user_data.sh
# This script runs when EC2 instances launch

set -e

# Update system
yum update -y

# Install Docker
yum install -y docker
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
rpm -U ./amazon-cloudwatch-agent.rpm

# Create application directory
mkdir -p /opt/app
cd /opt/app

# Create .env file with configuration
cat > /opt/app/.env << EOF
NODE_ENV=production
PORT=3000

# Database Configuration
DB_HOST=${db_endpoint}
DB_PORT=5432
DB_NAME=mediaplatform
DB_USER=\$DB_USERNAME
DB_PASSWORD=\$DB_PASSWORD

# Redis Configuration
REDIS_HOST=${redis_endpoint}
REDIS_PORT=6379

# AWS Configuration
AWS_REGION=$(ec2-metadata --availability-zone | cut -d " " -f 2 | sed 's/.$//')
S3_MEDIA_BUCKET=${s3_bucket}
SQS_QUEUE_URL=${sqs_queue_url}

# JWT Configuration
JWT_SECRET=\$JWT_SECRET
JWT_EXPIRES_IN=24h

# Application Configuration
MAX_UPLOAD_SIZE=104857600
ALLOWED_FILE_TYPES=image/jpeg,image/png,image/gif,video/mp4,video/quicktime
EOF

# Pull and run the application container from ECR
# Note: You'll need to push your image to ECR first
# Example: 
# AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
# aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
# docker pull $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/media-api:latest
# docker run -d --name media-api -p 3000:3000 --env-file /opt/app/.env --restart unless-stopped $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/media-api:latest

# For now, create a simple health check endpoint using nginx
yum install -y nginx
cat > /etc/nginx/conf.d/health.conf << 'NGINX_EOF'
server {
    listen 3000;
    
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
NGINX_EOF

systemctl start nginx
systemctl enable nginx

# Configure CloudWatch agent
cat > /opt/aws/amazon-cloudwatch-agent/etc/config.json << 'CW_EOF'
{
  "metrics": {
    "namespace": "MediaPlatform/App",
    "metrics_collected": {
      "cpu": {
        "measurement": [
          {"name": "cpu_usage_idle", "rename": "CPU_IDLE", "unit": "Percent"},
          {"name": "cpu_usage_iowait", "rename": "CPU_IOWAIT", "unit": "Percent"}
        ],
        "metrics_collection_interval": 60,
        "totalcpu": false
      },
      "disk": {
        "measurement": [
          {"name": "used_percent", "rename": "DISK_USED", "unit": "Percent"}
        ],
        "metrics_collection_interval": 60,
        "resources": ["*"]
      },
      "mem": {
        "measurement": [
          {"name": "mem_used_percent", "rename": "MEM_USED", "unit": "Percent"}
        ],
        "metrics_collection_interval": 60
      }
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/app/*.log",
            "log_group_name": "/aws/ec2/media-platform",
            "log_stream_name": "{instance_id}/app.log"
          }
        ]
      }
    }
  }
}
CW_EOF

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -s \
    -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json

echo "User data script completed successfully"
