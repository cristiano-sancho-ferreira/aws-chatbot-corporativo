# ============================================================
# Tabela de conexões WebSocket ativas
# Chave: connectionId (String)
# TTL automático pelo atributo "ttl" — conexões órfãs expiram sozinhas.
# ============================================================

resource "aws_dynamodb_table" "websocket_connections" {
  name         = "${var.name_prefix}-ws-connections"
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

  tags = var.common_tags
}

# ============================================================
# Tabela de histórico de conversas
#
# Modelo de acesso:
#   - PK: conversationId  →  agrupa todas as mensagens de uma conversa
#   - SK: timestamp       →  ordena cronologicamente dentro da conversa
#
# Cada item representa uma mensagem e guarda:
#   conversationId  (S)  — ID gerado pelo frontend (UUID)
#   timestamp       (S)  — ISO-8601 do momento do envio
#   role            (S)  — "user" | "assistant"
#   content         (S)  — texto da mensagem
#   messageId       (S)  — UUID único da mensagem
#   ttl             (N)  — expiração automática (segundos Unix)
# ============================================================

resource "aws_dynamodb_table" "chat_history" {
  name         = "${var.name_prefix}-chat-history"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "conversationId"
  range_key    = "timestamp"

  attribute {
    name = "conversationId"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = var.common_tags
}
