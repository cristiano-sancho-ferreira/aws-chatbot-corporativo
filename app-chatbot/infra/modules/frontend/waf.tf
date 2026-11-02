# ============================================================
# WAF — Web Application Firewall
#
# O WAF para CloudFront DEVE ser criado na região us-east-1
# independentemente da região do stack. Por isso usamos um
# provider alias "us_east_1" declarado no root do módulo.
#
# Regras incluídas (gerenciadas pela AWS):
#   - AWSManagedRulesCommonRuleSet     : OWASP Top 10 genérico
#   - AWSManagedRulesKnownBadInputsRuleSet : Log4j, SQLi, XSS
#   - AWSManagedRulesAmazonIpReputationList: IPs maliciosos conhecidos
#
# Rate limiting:
#   - 2000 req/5 min por IP — protege contra DDoS simples e brute-force
# ============================================================

resource "aws_wafv2_web_acl" "chatbot" {
  provider    = aws.us_east_1
  name        = "${var.name_prefix}-waf"
  description = "WAF para CloudFront do chatbot"
  scope       = "CLOUDFRONT"
  tags        = var.common_tags

  default_action {
    allow {}
  }

  # ── Regra 1: Rate limiting por IP ────────────────────────
  rule {
    name     = "RateLimitPerIP"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # ── Regra 2: IPs maliciosos conhecidos ───────────────────
  rule {
    name     = "AWSManagedRulesAmazonIpReputationList"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  # ── Regra 3: OWASP Top 10 genérico ───────────────────────
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-common-rules"
      sampled_requests_enabled   = true
    }
  }

  # ── Regra 4: Inputs maliciosos conhecidos (Log4j, SQLi, XSS) ──
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 4

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name_prefix}-waf"
    sampled_requests_enabled   = true
  }
}

# ── Associa o WAF à distribuição CloudFront ───────────────
resource "aws_wafv2_web_acl_association" "chatbot_cloudfront" {
  provider     = aws.us_east_1
  resource_arn = aws_cloudfront_distribution.chatbot_corp.arn
  web_acl_arn  = aws_wafv2_web_acl.chatbot.arn
}
