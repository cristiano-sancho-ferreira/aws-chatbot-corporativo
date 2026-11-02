# ============================================================
# Lambda Processor — acionada pelo DynamoDB Stream da chat-history
#
# Responsabilidade:
#   1. Recebe eventos do stream quando novas mensagens são gravadas
#   2. A cada N mensagens do assistente, verifica se a conversa
#      ultrapassou SUMMARY_THRESHOLD mensagens
#   3. Se sim, invoca o Bedrock (Haiku) para sumarizar o histórico antigo
#   4. Persiste o resumo na tabela summaries com a chave conversationId
#
# Isso implementa a "summary strategy" do diagrama:
#   sliding window → last 30 msg → summary
# ============================================================

# ── IAM Role ─────────────────────────────────────────────────────────────────

resource "aws_iam_role" "processor_exec" {
  name = "${var.name_prefix}-processor-role"

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

resource "aws_iam_role_policy" "processor_policy" {
  name = "${var.name_prefix}-processor-policy"
  role = aws_iam_role.processor_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # CloudWatch Logs
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:${data.aws_partition.current.partition}:logs:*:*:*"
      },
      # Ler o stream do DynamoDB
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:DescribeStream",
          "dynamodb:ListStreams"
        ]
        Resource = aws_dynamodb_table.chat_history.stream_arn
      },
      # Ler o histórico completo da conversa para sumarizar
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Query"]
        Resource = aws_dynamodb_table.chat_history.arn
      },
      # Gravar e ler resumos na tabela summaries
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.summaries.arn
      },
      # Invocar o Bedrock Haiku para sumarização
      {
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = "arn:${data.aws_partition.current.partition}:bedrock:${var.region}::foundation-model/${var.bedrock_model_haiku}"
      }
    ]
  })
}

# ── Lambda Function ───────────────────────────────────────────────────────────

resource "aws_lambda_function" "processor" {
  function_name    = "${var.name_prefix}-processor"
  role             = aws_iam_role.processor_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  filename         = "${path.module}/lambda/processor.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda/processor.zip")
  timeout          = 60

  environment {
    variables = {
      APP_REGION         = var.region
      BEDROCK_MODEL_HAIKU = var.bedrock_model_haiku
      CHAT_HISTORY_TABLE = aws_dynamodb_table.chat_history.name
      SUMMARIES_TABLE    = aws_dynamodb_table.summaries.name
      # Quantas mensagens da conversa disparam a sumarização
      SUMMARY_THRESHOLD  = "30"
      # Quantas mensagens recentes manter após o resumo (sliding window)
      SUMMARY_KEEP_LAST  = "10"
    }
  }

  tags = var.common_tags
}

# ── DynamoDB Stream → Lambda trigger ────────────────────────────────────────

resource "aws_lambda_event_source_mapping" "processor_stream" {
  event_source_arn              = aws_dynamodb_table.chat_history.stream_arn
  function_name                 = aws_lambda_function.processor.arn
  starting_position             = "LATEST"
  batch_size                    = 10
  maximum_batching_window_in_seconds = 5

  # Só processa registros de INSERT (novas mensagens)
  filter_criteria {
    filter {
      pattern = jsonencode({ eventName = ["INSERT"] })
    }
  }

  # Não bloqueia o stream em caso de erro — loga e continua
  bisect_batch_on_function_error = true
  maximum_retry_attempts         = 2

  depends_on = [aws_iam_role_policy.processor_policy]
}
