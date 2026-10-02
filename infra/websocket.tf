# Tabela de conexões WebSocket
resource "aws_dynamodb_table" "websocket_connections" {
  name         = "${local.name_prefix}-ws-connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "connectionId"

  attribute {
    name = "connectionId"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = local.common_tags
}

# Permissões para as funções Lambda acessarem a tabela de conexões e os logs
resource "aws_iam_role" "websocket_lambda_exec" {
  name = "${local.name_prefix}-websocket-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "websocket_lambda_policy" {
  name = "${local.name_prefix}-websocket-lambda-policy"
  role = aws_iam_role.websocket_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:DeleteItem",
          "dynamodb:UpdateItem"
        ]
        Resource = aws_dynamodb_table.websocket_connections.arn
      }
    ]
  })
}

data "archive_file" "websocket_authorizer_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/websocket-authorizer"
  output_path = "${path.module}/.terraform/websocket-authorizer.zip"
}

data "archive_file" "websocket_connect_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/websocket-connect"
  output_path = "${path.module}/.terraform/websocket-connect.zip"
}

data "archive_file" "websocket_disconnect_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/websocket-disconnect"
  output_path = "${path.module}/.terraform/websocket-disconnect.zip"
}

resource "aws_lambda_function" "websocket_authorizer" {
  function_name    = "${local.name_prefix}-websocket-authorizer"
  role             = aws_iam_role.websocket_lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.websocket_authorizer_zip.output_path
  source_code_hash = data.archive_file.websocket_authorizer_zip.output_base64sha256

  environment {
    variables = {
      APP_REGION = var.region
    }
  }

  tags = local.common_tags
}

resource "aws_lambda_function" "websocket_connect" {
  function_name    = "${local.name_prefix}-websocket-connect"
  role             = aws_iam_role.websocket_lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.websocket_connect_zip.output_path
  source_code_hash = data.archive_file.websocket_connect_zip.output_base64sha256

  environment {
    variables = {
      APP_REGION           = var.region
      WS_CONNECTIONS_TABLE = aws_dynamodb_table.websocket_connections.name
    }
  }

  tags = local.common_tags
}

resource "aws_lambda_function" "websocket_disconnect" {
  function_name    = "${local.name_prefix}-websocket-disconnect"
  role             = aws_iam_role.websocket_lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.websocket_disconnect_zip.output_path
  source_code_hash = data.archive_file.websocket_disconnect_zip.output_base64sha256

  environment {
    variables = {
      APP_REGION           = var.region
      WS_CONNECTIONS_TABLE = aws_dynamodb_table.websocket_connections.name
    }
  }

  tags = local.common_tags
}

resource "aws_apigatewayv2_api" "chat_websocket" {
  name                       = "${local.name_prefix}-chat-websocket"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
  description                = "API WebSocket para o chatbot com autenticação Cognito via Lambda Authorizer"
}

resource "aws_apigatewayv2_authorizer" "chat_websocket_authorizer" {
  api_id           = aws_apigatewayv2_api.chat_websocket.id
  authorizer_type  = "REQUEST"
  authorizer_uri   = aws_lambda_function.websocket_authorizer.invoke_arn
  identity_sources = ["route.request.header.Authorization", "route.request.querystring.token"]
  name             = "${local.name_prefix}-websocket-authorizer"
}

resource "aws_apigatewayv2_integration" "connect_integration" {
  api_id             = aws_apigatewayv2_api.chat_websocket.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.websocket_connect.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "disconnect_integration" {
  api_id             = aws_apigatewayv2_api.chat_websocket.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.websocket_disconnect.invoke_arn
  integration_method = "POST"
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

resource "aws_apigatewayv2_stage" "chat_websocket_stage" {
  api_id = aws_apigatewayv2_api.chat_websocket.id
  name   = "prod"

  auto_deploy = true

  tags = local.common_tags
}

resource "aws_lambda_permission" "authorizer_permission" {
  statement_id  = "AllowExecutionFromAPIGatewayAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.websocket_authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.chat_websocket.execution_arn}/*/*"
}

resource "aws_lambda_permission" "connect_permission" {
  statement_id  = "AllowExecutionFromAPIGatewayConnect"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.websocket_connect.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.chat_websocket.execution_arn}/*/$connect"
}

resource "aws_lambda_permission" "disconnect_permission" {
  statement_id  = "AllowExecutionFromAPIGatewayDisconnect"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.websocket_disconnect.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.chat_websocket.execution_arn}/*/$disconnect"
}

output "websocket_api_id" {
  description = "ID da API WebSocket do chatbot"
  value       = aws_apigatewayv2_api.chat_websocket.id
}

output "websocket_api_endpoint" {
  description = "Endpoint do WebSocket para o frontend conectar"
  value       = aws_apigatewayv2_stage.chat_websocket_stage.invoke_url
}

output "websocket_connections_table" {
  description = "Tabela DynamoDB usada para registrar conexões ativas"
  value       = aws_dynamodb_table.websocket_connections.name
}
