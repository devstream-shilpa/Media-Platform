# terraform/secrets.tf
# AWS Secrets Manager for database credentials

resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "media/db-credentials-${var.environment}"
  description = "Database credentials for Media Platform"

  tags = {
    Name = "media-db-credentials-${var.environment}"
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id

  secret_string = jsonencode({
    username = var.db_username
    password = var.db_password
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    database = "mediaplatform"
  })
}
