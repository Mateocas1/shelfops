resource "aws_sns_topic" "alarms" {
  name              = "${var.name}-alarms"
  kms_master_key_id = "alias/aws/sns"

  tags = { Name = "${var.name}-alarms" }
}

resource "aws_sns_topic_subscription" "email" {
  count = var.alarm_email == "" ? 0 : 1

  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  count = var.alb_arn_suffix == null ? 0 : 1

  alarm_name          = "${var.name}-alb-5xx"
  alarm_description   = "Any ALB-generated 5xx response"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Elb_5XX_Count"
  dimensions          = { LoadBalancer = var.alb_arn_suffix }
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  tags = { Name = "${var.name}-alb-5xx" }
}

resource "aws_cloudwatch_metric_alarm" "alb_latency_p95" {
  count = var.target_group_arn_suffix == null ? 0 : 1

  alarm_name          = "${var.name}-alb-p95-latency"
  alarm_description   = "Target p95 response time above ${var.latency_p95_threshold_seconds}s"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  dimensions          = { TargetGroup = var.target_group_arn_suffix }
  extended_statistic  = "p95"
  period              = 60
  evaluation_periods  = 5
  threshold           = var.latency_p95_threshold_seconds
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  tags = { Name = "${var.name}-alb-p95-latency" }
}

resource "aws_cloudwatch_metric_alarm" "ecs_cpu" {
  count = var.ecs_cluster_name == null || var.ecs_service_name == null ? 0 : 1

  alarm_name          = "${var.name}-ecs-cpu"
  alarm_description   = "ECS service CPU above 80%"
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  dimensions          = { ClusterName = var.ecs_cluster_name, ServiceName = var.ecs_service_name }
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  tags = { Name = "${var.name}-ecs-cpu" }
}

resource "aws_cloudwatch_metric_alarm" "ecs_memory" {
  count = var.ecs_cluster_name == null || var.ecs_service_name == null ? 0 : 1

  alarm_name          = "${var.name}-ecs-memory"
  alarm_description   = "ECS service memory above 80%"
  namespace           = "AWS/ECS"
  metric_name         = "MemoryUtilization"
  dimensions          = { ClusterName = var.ecs_cluster_name, ServiceName = var.ecs_service_name }
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  tags = { Name = "${var.name}-ecs-memory" }
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  count = var.rds_identifier == null ? 0 : 1

  alarm_name          = "${var.name}-rds-cpu"
  alarm_description   = "RDS CPU above 80%"
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  dimensions          = { DBInstanceIdentifier = var.rds_identifier }
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  tags = { Name = "${var.name}-rds-cpu" }
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  count = var.rds_identifier == null ? 0 : 1

  alarm_name          = "${var.name}-rds-connections"
  alarm_description   = "RDS connections above ${var.rds_connections_threshold}"
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  dimensions          = { DBInstanceIdentifier = var.rds_identifier }
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 3
  threshold           = var.rds_connections_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  tags = { Name = "${var.name}-rds-connections" }
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  count = var.rds_identifier == null ? 0 : 1

  alarm_name          = "${var.name}-rds-free-storage"
  alarm_description   = "RDS free storage below 2 GiB"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = { DBInstanceIdentifier = var.rds_identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 1
  threshold           = 2147483648
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  tags = { Name = "${var.name}-rds-free-storage" }
}

locals {
  candidate_widgets = [
    var.alb_arn_suffix == null ? null : {
      type   = "metric"
      x      = 0
      y      = 0
      width  = 12
      height = 6
      properties = {
        title  = "ALB requests and 5xx"
        region = var.region
        view   = "timeSeries"
        metrics = [
          ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_arn_suffix, { stat = "Sum" }],
          ["AWS/ApplicationELB", "HTTPCode_Elb_5XX_Count", "LoadBalancer", var.alb_arn_suffix, { stat = "Sum" }],
        ]
      }
    },
    var.ecs_service_name == null ? null : {
      type   = "metric"
      x      = 12
      y      = 0
      width  = 12
      height = 6
      properties = {
        title  = "ECS CPU and memory"
        region = var.region
        view   = "timeSeries"
        metrics = [
          ["AWS/ECS", "CPUUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_service_name, { stat = "Average" }],
          ["AWS/ECS", "MemoryUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_service_name, { stat = "Average" }],
        ]
      }
    },
    var.rds_identifier == null ? null : {
      type   = "metric"
      x      = 0
      y      = 6
      width  = 12
      height = 6
      properties = {
        title  = "RDS CPU, connections and free storage"
        region = var.region
        view   = "timeSeries"
        metrics = [
          ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", var.rds_identifier, { stat = "Average" }],
          ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", var.rds_identifier, { stat = "Average" }],
          ["AWS/RDS", "FreeStorageSpace", "DBInstanceIdentifier", var.rds_identifier, { stat = "Average" }],
        ]
      }
    },
    var.log_group_name == null ? null : {
      type   = "log"
      x      = 12
      y      = 6
      width  = 12
      height = 6
      properties = {
        title  = "Recent application logs"
        region = var.region
        query  = "SOURCE '${var.log_group_name}' | fields @timestamp, @message | sort @timestamp desc | limit 20"
      }
    },
  ]
  dashboard_widgets = [for widget in local.candidate_widgets : widget if widget != null]
}

resource "aws_cloudwatch_dashboard" "this" {
  dashboard_name = "${var.name}-api"
  dashboard_body = jsonencode({ widgets = local.dashboard_widgets })
}
