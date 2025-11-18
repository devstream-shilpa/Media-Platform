cat > terraform/variables.tf << 'EOF'
variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "media-platform"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "db_username" {
  description = "Database master username"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Database master password"
  type        = string
  sensitive   = true
}

variable "key_name" {
  description = "EC2 key pair name for SSH access"
  type        = string
}

variable "alert_email" {
  description = "Email address for CloudWatch alerts"
  type        = string
  default     = "admin@example.com"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.medium"
}

variable "asg_min_size" {
  description = "Minimum instances in ASG"
  type        = number
  default     = 2
}

variable "asg_max_size" {
  description = "Maximum instances in ASG"
  type        = number
  default     = 6
}

variable "asg_desired_capacity" {
  description = "Desired instances in ASG"
  type        = number
  default     = 2
}
EOF
