# deploy.ps1
# Instala dependências das Lambdas e aplica a infraestrutura com Terraform.
# Uso: .\deploy.ps1 [-Destroy]

param(
  [switch]$Destroy
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot

# ── 1. Instala dependências das Lambdas ──────────────────────────────────────

$lambdas = @("websocket-connect", "websocket-disconnect", "websocket-message")

foreach ($lambda in $lambdas) {
  $path = Join-Path $Root "backend\$lambda"
  Write-Host "`n→ Instalando dependências: $lambda" -ForegroundColor Cyan

  Push-Location $path
  try {
    npm ci --omit=dev
    if ($LASTEXITCODE -ne 0) {
      Write-Error "npm ci falhou em $lambda. Abortando."
      exit 1
    }
  } finally {
    Pop-Location
  }
}

Write-Host "`n✔ Dependências instaladas." -ForegroundColor Green

# ── 2. Terraform ─────────────────────────────────────────────────────────────

Push-Location (Join-Path $Root "infra")
try {
  Write-Host "`n→ Inicializando Terraform..." -ForegroundColor Cyan
  terraform init -var-file="prd.tfvars" -backend-config="region=us-east-2" -backend-config="bucket=imersao-aws-ia-terraform-states" -upgrade 

  if ($Destroy) {
    Write-Host "`n→ Destruindo infraestrutura..." -ForegroundColor Yellow
    terraform destroy -auto-approve -var-file="prd.tfvars"
  } else {
    Write-Host "`n→ Aplicando infraestrutura..." -ForegroundColor Cyan
    terraform apply -auto-approve -var-file="prd.tfvars"
  }

  if ($LASTEXITCODE -ne 0) {
    Write-Error "Terraform falhou."
    exit 1
  }
} finally {
  Pop-Location
}

Write-Host "`n✔ Deploy concluído." -ForegroundColor Green
