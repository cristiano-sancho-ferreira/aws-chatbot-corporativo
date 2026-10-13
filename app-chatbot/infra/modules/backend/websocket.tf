# ============================================================
# IAM — Lambda connect/disconnect/authorizer
# ============================================================

resource "aws_iam_role" "websocket_lambda_exec" {
  name = "${var.name_prefix}-websocket-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.common_tags
}

resource "aws_iam_role_policy" "websocket_lambda_policy" {
  name = "${var.name_prefix}-websocket-lambda-policy"
  role = aws_iam_role.websocket_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:DeleteItem", "dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.websocket_connections.arn
      }
    ]
  })
}

# ============================================================
# IAM — Lambda message
# ============================================================

resource "aws_iam_role" "websocket_message_exec" {
  name = "${var.name_prefix}-websocket-message-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.common_tags
}

resource "aws_iam_role_policy" "websocket_message_policy" {
  name = "${var.name_prefix}-websocket-message-policy"
  role = aws_iam_role.websocket_message_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:${data.aws_partition.current.partition}:logs:*:*:*"
      },
      {
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = "arn:${data.aws_partition.current.partition}:bedrock:${var.region}::foundation-model/${var.bedrock_model_id}"
      },
      {
        Effect   = "Allow"
        Action   = ["execute-api:ManageConnections"]
        Resource = "arn:${data.aws_partition.current.partition}:execute-api:${var.region}:*:*/*/@connections/*"
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:Query"]
        Resource = aws_dynamodb_table.chat_history.arn
      }
    ]
  })
}



# ============================================================
# API Gateway WebSocket
# ============================================================

resource "aws_apigatewayv2_api" "chat_websocket" {
  name                       = "${var.name_prefix}-chat-websocket"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
  description                = "API WebSocket para o chatbot com autenticação Cognito via Lambda Authorizer"
}

resource "aws_apigatewayv2_authorizer" "chat_websocket_authorizer" {
  api_id           = aws_apigatewayv2_api.chat_websocket.id
  authorizer_type  = "REQUEST"
  authorizer_uri   = "arn:${data.aws_partition.current.partition}:apigateway:${var.region}:lambda:path/2015-03-31/functions/arn:${data.aws_partition.current.partition}:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:${var.name_prefix}-websocket-authorizer/invocations"
  identity_sources = ["route.request.querystring.token"]
  name             = "${var.name_prefix}-websocket-authorizer"
}

resource "aws_apigatewayv2_integration" "connect_integration" {
  api_id             = aws_apigatewayv2_api.chat_websocket.id
  integration_type   = "AWS_PROXY"
  integration_uri      = "arn:aws:lambda:us-east-1:401932890892:function:${var.name_prefix}-websocket-connect"
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "disconnect_integration" {
  api_id             = aws_apigatewayv2_api.chat_websocket.id
  integration_type   = "AWS_PROXY"
  integration_uri      = "arn:aws:lambda:us-east-1:401932890892:function:${var.name_prefix}-websocket-disconnect" 
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "message_integration" {
  api_id               = aws_apigatewayv2_api.chat_websocket.id
  integration_type     = "AWS_PROXY"
  integration_uri      = "arn:aws:lambda:us-east-1:401932890892:function:${var.name_prefix}-websocket-message"
  integration_method   = "POST"
  timeout_milliseconds = 29000
}

resource "aws_apigatewayv2_route" "connect_route" {
  api_id             = aws_apigatewayv2_api.chat_websocket.id
  route_key          = "$connect"
  target             = "integrations/${aws_apigatewayv2_integration.connect_integration.id}"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.chat_websocket_authorizer.id
}

resource "aws_apigatewayv2_route" "disconnect_route" {
  api_id    = aws_apigatewayv2_api.chat_websocket.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.disconnect_integration.id}"
}

resource "aws_apigatewayv2_route" "message_route" {
  api_id    = aws_apigatewayv2_api.chat_websocket.id
  route_key = "sendMessage"
  target    = "integrations/${aws_apigatewayv2_integration.message_integration.id}"
}

resource "aws_apigatewayv2_stage" "chat_websocket_stage" {
  api_id      = aws_apigatewayv2_api.chat_websocket.id
  name        = "prod"
  auto_deploy = true
  tags        = var.common_tags
}




