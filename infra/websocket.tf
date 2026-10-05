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

resource "aws_iam_role" "websocket_message_exec" {
  name = "${local.name_prefix}-websocket-message-role"

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

resource "aws_iam_role_policy" "websocket_message_policy" {
  name = "${local.name_prefix}-websocket-message-policy"
  role = aws_iam_role.websocket_message_exec.id

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
        Resource = "${aws_apigatewayv2_api.chat_websocket.execution_arn}/*/POST/@connections/*"
      }
    ]
  })
}

data "archive_file" "websocket_authorizer_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/websocket-authorizer"
  output_path = "${path.module}/.terraform/websocket-authorizer.zip"
}

resource "null_resource" "install_connect_lambda_dependencies" {
  triggers = {
    package_lock = filemd5("${path.module}/../backend/websocket-connect/package-lock.json")
    always_run   = timestamp()
  }

  provisioner "local-exec" {
    working_dir = "${path.module}/../backend/websocket-connect"
    command     = "npm ci --omit=dev"
  }
}

data "archive_file" "websocket_connect_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/websocket-connect"
  output_path = "${path.module}/.terraform/websocket-connect.zip"

  depends_on = [null_resource.install_connect_lambda_dependencies]
}

resource "null_resource" "install_disconnect_lambda_dependencies" {
  triggers = {
    package_lock = filemd5("${path.module}/../backend/websocket-disconnect/package-lock.json")
    always_run   = timestamp()
  }

  provisioner "local-exec" {
    working_dir = "${path.module}/../backend/websocket-disconnect"
    command     = "npm ci --omit=dev"
  }
}

data "archive_file" "websocket_disconnect_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/websocket-disconnect"
  output_path = "${path.module}/.terraform/websocket-disconnect.zip"

  depends_on = [null_resource.install_disconnect_lambda_dependencies]
}

resource "null_resource" "install_message_lambda_dependencies" {
  triggers = {
    package_lock = filemd5("${path.module}/../backend/websocket-message/package-lock.json")
    always_run   = timestamp()
  }

  provisioner "local-exec" {
    working_dir = "${path.module}/../backend/websocket-message"
    command     = "npm ci --omit=dev"
  }
}

data "archive_file" "websocket_message_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/websocket-message"
  output_path = "${path.module}/.terraform/websocket-message.zip"

  depends_on = [null_resource.install_message_lambda_dependencies]
}

resource "aws_lambda_function" "websocket_authorizer" {
  function_name    = "${local.name_prefix}-websocket-authorizer"
  role             = aws_iam_role.websocket_lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  filename         = data.archive_file.websocket_authorizer_zip.output_path
  source_code_hash = data.archive_file.websocket_authorizer_zip.output_base64sha256
  timeout          = 10

  environment {
    variables = {
      APP_REGION        = var.region
      COGNITO_ISSUER    = "https://cognito-idp.${var.region}.${data.aws_partition.current.dns_suffix}/${var.manage_cognito_user_pool ? aws_cognito_user_pool.users[0].id : var.existing_user_pool_id}"
      COGNITO_CLIENT_ID = var.manage_cognito_user_pool ? aws_cognito_user_pool_client.spa[0].id : var.existing_user_pool_client_id
    }
  }

  tags = local.common_tags
}

resource "aws_lambda_function" "websocket_connect" {
  function_name    = "${local.name_prefix}-websocket-connect"
  role             = aws_iam_role.websocket_lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
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
  runtime          = "nodejs22.x"
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

resource "aws_lambda_function" "websocket_message" {
  function_name    = "${local.name_prefix}-websocket-message"
  role             = aws_iam_role.websocket_message_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  filename         = data.archive_file.websocket_message_zip.output_path
  source_code_hash = data.archive_file.websocket_message_zip.output_base64sha256
  timeout          = 60

  environment {
    variables = {
      APP_REGION       = var.region
      BEDROCK_MODEL_ID = var.bedrock_model_id
      WS_CALLBACK_URL  = "https://${aws_apigatewayv2_api.chat_websocket.id}.execute-api.${var.region}.amazonaws.com/prod"
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
  api_id                           = aws_apigatewayv2_api.chat_websocket.id
  authorizer_type                  = "REQUEST"
  authorizer_uri                   = aws_lambda_function.websocket_authorizer.invoke_arn
  authorizer_result_ttl_in_seconds = 0
  identity_sources                 = ["route.request.querystring.token"]
  name                             = "${local.name_prefix}-websocket-authorizer"
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

resource "aws_apigatewayv2_integration" "message_integration" {
  api_id               = aws_apigatewayv2_api.chat_websocket.id
  integration_type     = "AWS_PROXY"
  integration_uri      = aws_lambda_function.websocket_message.invoke_arn
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
  source_arn    = "${aws_apigatewayv2_api.chat_websocket.execution_arn}/authorizers/${aws_apigatewayv2_authorizer.chat_websocket_authorizer.id}"
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

resource "aws_lambda_permission" "message_permission" {
  statement_id  = "AllowExecutionFromAPIGatewayMessage"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.websocket_message.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.chat_websocket.execution_arn}/*/sendMessage"
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
