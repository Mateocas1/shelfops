resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db"
  subnet_ids = var.private_subnet_ids

  tags = { Name = "${var.name}-db" }
}

resource "aws_security_group" "this" {
  name_prefix = "${var.name}-db-"
  description = "PostgreSQL reachable only from the application task"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.name}-db" }

  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "from_task" {
  security_group_id            = aws_security_group.this.id
  description                  = "PostgreSQL from the application task"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = var.task_security_group_id
}

resource "aws_vpc_security_group_egress_rule" "maintenance" {
  security_group_id = aws_security_group.this.id
  description       = "Outbound for RDS maintenance and replication"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# rds.force_ssl rejects plaintext connections, matching DATABASE_SSL_MODE=verify-full.
resource "aws_db_parameter_group" "this" {
  name_prefix = "${var.name}-pg16-"
  family      = "postgres16"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = { Name = "${var.name}-pg16" }

  lifecycle { create_before_destroy = true }
}

resource "aws_db_instance" "this" {
  #checkov:skip=CKV_AWS_157:single-AZ is a deliberate cost decision for an ephemeral demo
  #checkov:skip=CKV_AWS_118:enhanced monitoring has no free tier and is not needed for the demo
  #checkov:skip=CKV_AWS_353:Performance Insights has no free tier and is not needed for the demo
  #checkov:skip=CKV_AWS_129:PostgreSQL log exports are omitted to keep the demo at USD 0
  #checkov:skip=CKV_AWS_161:IAM database authentication is not used; a generated password is stored in Secrets Manager
  #checkov:skip=CKV_AWS_226:minor version upgrades are pinned so a demo apply is reproducible
  #checkov:skip=CKV_AWS_293:deletion protection is configurable and off for the ephemeral demo
  identifier                          = "${var.name}-db"
  engine                              = "postgres"
  engine_version                      = var.engine_version
  instance_class                      = var.instance_class
  allocated_storage                   = 20
  max_allocated_storage               = 0
  storage_type                        = "gp3"
  storage_encrypted                   = true
  db_name                             = var.database_name
  username                            = var.username
  password                            = var.password
  port                                = 5432
  db_subnet_group_name                = aws_db_subnet_group.this.name
  vpc_security_group_ids              = [aws_security_group.this.id]
  parameter_group_name                = aws_db_parameter_group.this.name
  multi_az                            = false
  publicly_accessible                 = false
  backup_retention_period             = var.backup_retention_days
  backup_window                       = "07:00-07:30"
  maintenance_window                  = "sun:07:30-sun:08:00"
  apply_immediately                   = true
  auto_minor_version_upgrade          = false
  deletion_protection                 = var.deletion_protection
  skip_final_snapshot                 = var.skip_final_snapshot
  final_snapshot_identifier           = var.skip_final_snapshot ? null : "${var.name}-db-final"
  copy_tags_to_snapshot               = true
  performance_insights_enabled        = false
  monitoring_interval                 = 0
  ca_cert_identifier                  = var.ca_cert_identifier
  iam_database_authentication_enabled = false

  tags = { Name = "${var.name}-db" }
}
