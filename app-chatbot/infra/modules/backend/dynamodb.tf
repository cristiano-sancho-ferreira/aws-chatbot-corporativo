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
# Tabela de pedidos
#
# Modelo de acesso:
#   - PK: userId      →  todos os pedidos de um usuário (sub do Cognito)
#   - SK: orderId     →  identificador único do pedido
#
# GSI order_by_date permite listar pedidos recentes:
#   - PK: userId
#   - SK: createdAt (ISO-8601, permite ordenação lexicográfica)
#
# Cada item representa um pedido e guarda:
#   userId      (S)  — sub do Cognito
#   orderId     (S)  — UUID do pedido
#   createdAt   (S)  — ISO-8601 da criação
#   status      (S)  — ex: "pendente" | "confirmado" | "entregue" | "cancelado"
#   items       (S)  — JSON serializado da lista de itens
#   total       (N)  — valor total em centavos
#   ttl         (N)  — expiração automática (opcional, 1 ano)
# ============================================================

resource "aws_dynamodb_table" "orders" {
  name         = "${var.name_prefix}-orders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "orderId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "orderId"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name            = "order_by_date"
    hash_key        = "userId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = var.common_tags
}

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
