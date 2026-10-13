#!/usr/bin/env bash
# deploy.sh
# Instala dependências das Lambdas e aplica a infraestrutura com Terraform.
# Uso: ./deploy.sh [--destroy]

set -euo pipefail

DESTROY=false
if [[ "${1:-}" == "--destroy" ]]; then
  DESTROY=true
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 1. Instala dependências das Lambdas ──────────────────────────────────────

LAMBDAS=("websocket-connect" "websocket-disconnect" "websocket-message")

for lambda in "${LAMBDAS[@]}"; do
  echo ""
  echo "→ Instalando dependências: $lambda"
  (cd "$ROOT/backend/$lambda" && npm ci --omit=dev)
done

echo ""
echo "✔ Dependências instaladas."

# ── 2. Terraform ─────────────────────────────────────────────────────────────

cd "$ROOT/infra"

echo ""
echo "→ Inicializando Terraform..."
terraform init

if [ "$DESTROY" = true ]; then
  echo ""
  echo "→ Destruindo infraestrutura..."
  terraform destroy -auto-approve
else
  echo ""
  echo "→ Aplicando infraestrutura..."
  terraform apply -auto-approve
fi

echo ""
echo "✔ Deploy concluído."
