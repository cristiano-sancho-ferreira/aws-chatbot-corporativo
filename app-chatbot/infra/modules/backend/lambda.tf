# ============================================================
# Zips das Lambdas
# Gerados pelo deploy.ps1 / deploy.sh antes do terraform apply.
# Caminho: infra/.terraform/<nome>.zip
# ============================================================

locals {
  zip_dir = "${path.module}/../../.terraform"
}

# ============================================================
# Funções Lambda
# ============================================================

resource "aws_lambda_function" "websocket_authorizer" {
  function_name    = "${var.name_prefix}-websocket-authorizer"
  role             = aws_iam_role.websocket_lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  filename         = "${path.module}/lambda/websocket-authorizer.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda/websocket-authorizer.zip")
  timeout          = 10

  environment {
    variables = {
      APP_REGION        = var.region
      COGNITO_ISSUER    = "https://cognito-idp.${var.region}.${data.aws_partition.current.dns_suffix}/${var.cognito_user_pool_id}"
      COGNITO_CLIENT_ID = var.cognito_user_pool_client_id
    }
  }

  tags = var.common_tags
}

resource "aws_lambda_function" "websocket_connect" {
  function_name    = "${var.name_prefix}-websocket-connect"
  role             = aws_iam_role.websocket_lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  filename         = "${path.module}/lambda/websocket-connect.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda/websocket-connect.zip")

  environment {
    variables = {
      APP_REGION           = var.region
      WS_CONNECTIONS_TABLE = aws_dynamodb_table.websocket_connections.name
    }
  }

  tags = var.common_tags
}

resource "aws_lambda_function" "websocket_disconnect" {
  function_name    = "${var.name_prefix}-websocket-disconnect"
  role             = aws_iam_role.websocket_lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  filename         = "${path.module}/lambda/websocket-disconnect.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda/websocket-disconnect.zip")

  environment {
    variables = {
      APP_REGION           = var.region
      WS_CONNECTIONS_TABLE = aws_dynamodb_table.websocket_connections.name
    }
  }

  tags = var.common_tags
}

resource "aws_lambda_function" "websocket_message" {
  function_name    = "${var.name_prefix}-websocket-message"
  role             = aws_iam_role.websocket_message_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  filename         = "${path.module}/lambda/websocket-message.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda/websocket-message.zip")
  timeout          = 60

  environment {
    variables = {
      APP_REGION         = var.region
      BEDROCK_MODEL_ID   = var.bedrock_model_id
      WS_CALLBACK_URL    = "https://${aws_apigatewayv2_api.chat_websocket.id}.execute-api.${var.region}.amazonaws.com/prod"
      CHAT_HISTORY_TABLE = aws_dynamodb_table.chat_history.name
    }
  }

  tags = var.common_tags
}

# ============================================================
# Permissões Lambda → API Gateway
# ============================================================

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