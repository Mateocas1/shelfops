data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}

data "aws_cloudfront_response_headers_policy" "security" {
  name = "Managed-SecurityHeadersPolicy"
}

# Shared secret proving a request reached the ALB through CloudFront.
resource "random_password" "origin_verify" {
  length  = 32
  special = false
}

resource "aws_lb" "this" {
  #checkov:skip=CKV_AWS_91:access logging to S3 adds cost; the demo has no audit requirement
  #checkov:skip=CKV_AWS_150:deletion protection is intentionally disabled for an ephemeral demo
  name                             = "${var.name}-alb"
  internal                         = false
  load_balancer_type               = "application"
  security_groups                  = [var.alb_security_group_id]
  subnets                          = var.public_subnet_ids
  enable_deletion_protection       = false
  drop_invalid_header_fields       = true
  enable_cross_zone_load_balancing = true

  tags = { Name = "${var.name}-alb" }
}

resource "aws_lb_target_group" "this" {
  #checkov:skip=CKV_AWS_378:the ALB hop is HTTP inside the VPC; CloudFront terminates viewer TLS
  name        = "${var.name}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = var.health_check_path
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  deregistration_delay = 30

  tags = { Name = "${var.name}-tg" }
}

resource "aws_lb_listener" "http" {
  #checkov:skip=CKV_AWS_2:CloudFront terminates viewer TLS; the origin hop is HTTP with a secret header
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  # Anything that is not explicitly from CloudFront with the secret header gets 403.
  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "forbidden"
      status_code  = "403"
    }
  }

  tags = { Name = "${var.name}-http" }
}

resource "aws_lb_listener_rule" "cloudfront_origin" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }

  condition {
    http_header {
      http_header_name = "X-Origin-Verify"
      values           = [random_password.origin_verify.result]
    }
  }

  tags = { Name = "${var.name}-cloudfront-origin" }
}

resource "aws_cloudfront_distribution" "this" {
  #checkov:skip=CKV_AWS_68:WAF has a monthly cost and the demo budget is USD 0
  #checkov:skip=CKV_AWS_86:access logging to S3 adds cost and is not needed for the demo
  #checkov:skip=CKV_AWS_305:viewer requests target API paths, so no default root object is configured
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.name} API over CloudFront"
  price_class     = "PriceClass_100"
  http_version    = "http2"

  origin {
    domain_name = aws_lb.this.dns_name
    origin_id   = "alb"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_verify.result
    }
  }

  default_cache_behavior {
    target_origin_id           = "alb"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = false
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = { Name = "${var.name}-cdn" }
}
