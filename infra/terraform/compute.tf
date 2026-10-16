resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.prefix}"
  retention_in_days = 30
}
resource "aws_ecs_cluster" "main" {
  name = local.prefix
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}
resource "aws_iam_role" "execution" {
  name_prefix        = "${local.prefix}-execution-"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
resource "aws_iam_role_policy" "secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({ Version = "2012-10-17", Statement = concat([
    { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = var.runtime_secret_arn
    }
    ], var.secret_kms_key_arn == null ? [] : [
    { Effect = "Allow", Action = ["kms:Decrypt"], Resource = var.secret_kms_key_arn, Condition = { StringEquals = { "kms:ViaService" = "secretsmanager.${var.region}.amazonaws.com" } } }
  ]) })
}
resource "aws_iam_role" "task" {
  name_prefix        = "${local.prefix}-task-"
  assume_role_policy = aws_iam_role.execution.assume_role_policy
}
resource "aws_iam_role_policy" "media" {
  role = aws_iam_role.task.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.media.arn}/public/*"
    }
  ] })
}
resource "aws_lb" "main" {
  name                       = local.prefix
  internal                   = false
  load_balancer_type         = "application"
  subnets                    = aws_subnet.public[*].id
  security_groups            = [aws_security_group.alb.id]
  enable_deletion_protection = true
  drop_invalid_header_fields = true
}
resource "aws_lb_target_group" "api" {
  name                 = local.prefix
  port                 = 3001
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.main.id
  deregistration_delay = 30
  health_check {
    path                = "/api/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
resource "aws_ecs_task_definition" "app" {
  for_each                 = local.services
  family                   = "${local.prefix}-${each.key}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name                   = "app"
    image                  = var.image_uri
    essential              = true
    user                   = "1000:1000"
    readonlyRootFilesystem = true
    stopTimeout            = 60
    command                = each.key == "worker" ? ["node", "src/worker.js"] : ["node", "src/index.js"]
    portMappings           = each.key == "api" ? [{ containerPort = 3001, protocol = "tcp" }] : []
    environment = [for k, v in merge(var.extra_environment, {
      NODE_ENV            = "production", PORT = "3001", APP_URL = var.app_url,
      RUN_BACKGROUND_JOBS = "false", MEDIA_STORAGE = "s3", AWS_REGION = var.region,
      MEDIA_BUCKET        = aws_s3_bucket.media.id, MEDIA_PUBLIC_URL = "https://${aws_cloudfront_distribution.media.domain_name}"
    }) : { name = k, value = v }]
    secrets          = [for key in var.runtime_secret_keys : { name = key, valueFrom = "${var.runtime_secret_arn}:${key}::" }]
    logConfiguration = { logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.app.name, "awslogs-region" = var.region, "awslogs-stream-prefix" = each.key } }
    mountPoints      = [{ sourceVolume = "tmp", containerPath = "/app/tmp", readOnly = false }]
  }])
  volume {
    name = "tmp"
  }
}
resource "aws_ecs_service" "app" {
  for_each                           = local.services
  name                               = "${local.prefix}-${each.key}"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.app[each.key].arn
  desired_count                      = each.value
  launch_type                        = "FARGATE"
  platform_version                   = "1.4.0"
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false
  }
  dynamic "load_balancer" {
    for_each = each.key == "api" ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.api.arn
      container_name   = "app"
      container_port   = 3001
    }

  }
  depends_on = [aws_lb_listener.https, aws_iam_role_policy.secrets, aws_iam_role_policy.media]
}
resource "aws_sns_topic" "alarms" {
  name = "${local.prefix}-alarms"
}
resource "aws_sns_topic_subscription" "alarms" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}
resource "aws_cloudwatch_metric_alarm" "unhealthy" {
  alarm_name          = "${local.prefix}-unhealthy-targets"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "breaching"
  dimensions = { LoadBalancer = aws_lb.main.arn_suffix, TargetGroup = aws_lb_target_group.api.arn_suffix
  }
  alarm_actions = [aws_sns_topic.alarms.arn]
}
resource "aws_cloudwatch_metric_alarm" "db_storage" {
  alarm_name          = "${local.prefix}-database-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Minimum"
  threshold           = 5368709120
  dimensions = { DBInstanceIdentifier = aws_db_instance.main.identifier
  }
  alarm_actions = [aws_sns_topic.alarms.arn]
}
output "alb_dns_name" {
  value = aws_lb.main.dns_name
}
output "database_endpoint" {
  value = aws_db_instance.main.address
}
output "database_master_secret_arn" {
  value = aws_db_instance.main.master_user_secret[0].secret_arn
}
output "media_url" {
  value = "https://${aws_cloudfront_distribution.media.domain_name}"
}
output "app_security_group_id" {
  value = aws_security_group.app.id
}
