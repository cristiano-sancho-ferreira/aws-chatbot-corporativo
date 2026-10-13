# ============================================================
# Outputs
# ============================================================

output "websocket_api_endpoint" {
  description = "Endpoint WebSocket para o frontend conectar"
  value       = aws_apigatewayv2_stage.chat_websocket_stage.invoke_url
}

output "websocket_connections_table" {
  description = "Tabela DynamoDB de conexões ativas"
  value       = aws_dynamodb_table.websocket_connections.name
}

output "chat_history_table_name" {
  description = "Tabela DynamoDB de histórico de conversas"
  value       = aws_dynamodb_table.chat_history.name
}