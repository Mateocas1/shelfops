resource "aws_ecr_repository" "this" {
  #checkov:skip=CKV_AWS_136:AES256 default encryption is used to keep the demo free
  name                 = "${var.name}-api"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = { Name = "${var.name}-api" }
}

resource "aws_ecr_lifecycle_policy" "this" {
  repository = aws_ecr_repository.this.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after one day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      }
    ]
  })
}

#checkov:skip=CKV_AWS_158:KMS encryption of application logs is not required for the demo
resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.name}"
  retention_in_days = var.log_retention_days

  tags = { Name = "${var.name}-logs" }
}

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json

  tags = { Name = "${var.name}-task-execution" }
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secrets" {
  statement {
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = var.secret_arns
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "${var.name}-read-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

# The task role deliberately carries no policy: the API calls no AWS APIs.
resource "aws_iam_role" "task" {
  name               = "${var.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json

  tags = { Name = "${var.name}-task" }
}

resource "aws_ecs_cluster" "this" {
  name = "${var.name}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = { Name = "${var.name}-cluster" }
}

locals {
  log_options_api = {
    "awslogs-group"         = aws_cloudwatch_log_group.this.name
    "awslogs-region"        = var.region
    "awslogs-stream-prefix" = "api"
  }
  log_options_migrate = {
    "awslogs-group"         = aws_cloudwatch_log_group.this.name
    "awslogs-region"        = var.region
    "awslogs-stream-prefix" = "one-off"
  }
  container_environment = [for key, value in var.environment : { name = key, value = value }]
  container_secrets     = [for key, value in var.secrets : { name = key, valueFrom = value }]
  one_off_environment   = [for key, value in var.one_off_environment : { name = key, value = value }]
  one_off_secrets       = [for key, value in var.one_off_secrets : { name = key, valueFrom = value }]
  health_check = {
    command = [
      "CMD-SHELL",
      "node -e \"fetch('http://127.0.0.1:${var.container_port}/ready').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))\""
    ]
    interval    = 30
    timeout     = 5
    retries     = 3
    startPeriod = 60
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.container_cpu
  memory                   = var.container_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name                   = "api"
      image                  = var.container_image
      essential              = true
      portMappings           = [{ containerPort = var.container_port, hostPort = var.container_port, protocol = "tcp" }]
      environment            = local.container_environment
      secrets                = local.container_secrets
      healthCheck            = local.health_check
      logConfiguration       = { logDriver = "awslogs", options = local.log_options_api }
      linuxParameters        = { initProcessEnabled = true }
      readOnlyRootFilesystem = false
    }
  ])

  tags = { Name = "${var.name}-api" }
}

# One-off task for `migrate` and, by command override, `seed-tenant`.
resource "aws_ecs_task_definition" "one_off" {
  family                   = "${var.name}-one-off"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.container_cpu
  memory                   = var.container_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name             = "one-off"
      image            = coalesce(var.one_off_image, var.container_image)
      essential        = true
      command          = var.one_off_command
      environment      = local.one_off_environment
      secrets          = local.one_off_secrets
      logConfiguration = { logDriver = "awslogs", options = local.log_options_migrate }
      linuxParameters  = { initProcessEnabled = true }
    }
  ])

  tags = { Name = "${var.name}-one-off" }
}

resource "aws_ecs_service" "this" {
  #checkov:skip=CKV_AWS_333:the Fargate task has a public IP because there is no NAT gateway in the USD 0 design
  name                               = "${var.name}-api"
  cluster                            = aws_ecs_cluster.this.id
  task_definition                    = aws_ecs_task_definition.api.arn
  desired_count                      = var.desired_count
  launch_type                        = "FARGATE"
  health_check_grace_period_seconds  = 60
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100
  wait_for_steady_state              = var.wait_for_steady_state
  enable_execute_command             = var.enable_execute_command

  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [var.task_security_group_id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "api"
    container_port   = var.container_port
  }

  tags = { Name = "${var.name}-api" }
}
