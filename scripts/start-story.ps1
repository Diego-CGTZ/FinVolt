##############################################################################
# start-story.ps1
# Uso: .\scripts\start-story.ps1 -StoryId US-009
#
# Qué hace:
#   1. Crea la rama feature/<ID>-<slug> desde main (o la activa si ya existe)
#   2. Mueve el issue correspondiente en el GitHub Project a "In Progress"
##############################################################################

param(
    [Parameter(Mandatory)]
    [string]$StoryId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Constantes del proyecto ──────────────────────────────────────────────────
$REPO        = "Diego-CGTZ/FinVolt"
$PROJECT_NUM = 1
$OWNER       = "Diego-CGTZ"
$STATUS_FIELD_ID = "PVTSSF_lAHOB42opc4BhtJ7zhgn6_o"   # campo "Status"

# ── Helpers ──────────────────────────────────────────────────────────────────
function Get-SlugFromIssue([string]$title) {
    # "[US-009] Registrar gasto manual" → "registrar-gasto-manual"
    $clean = $title -replace '^\[.*?\]\s*', '' `
                    -replace '[^a-zA-Z0-9\s]', '' `
                    -replace '\s+', '-'
    return $clean.ToLower().Substring(0, [Math]::Min(40, $clean.Length))
}

# ── 1. Buscar el issue en GitHub ─────────────────────────────────────────────
Write-Host ""
Write-Host "🔍 Buscando issue $StoryId en GitHub..." -ForegroundColor Cyan

$issueJson = gh issue list `
    --repo $REPO `
    --search "[$StoryId]" `
    --json number,title,url `
    --limit 1 | ConvertFrom-Json

if (-not $issueJson -or $issueJson.Count -eq 0) {
    Write-Error "No se encontró un issue con el título [$StoryId]. ¿Ya fue importado el backlog?"
}

$issue = $issueJson[0]
$issueNumber = $issue.number
$issueTitle  = $issue.title
$issueUrl    = $issue.url

Write-Host "  Issue #$issueNumber: $issueTitle" -ForegroundColor Green

# ── 2. Construir nombre de rama ───────────────────────────────────────────────
$slug       = Get-SlugFromIssue $issueTitle
$branchName = "feature/$StoryId-$slug"

Write-Host ""
Write-Host "🌿 Rama: $branchName" -ForegroundColor Cyan

# ── 3. Asegurarse de estar en main actualizado ────────────────────────────────
$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -ne "main") {
    Write-Host "  Cambiando a main..." -ForegroundColor Yellow
    git checkout main | Out-Null
}
git pull origin main --quiet

# ── 4. Crear o cambiar a la rama ──────────────────────────────────────────────
$branchExists = git branch --list $branchName
if ($branchExists) {
    Write-Host "  La rama ya existe. Cambiando a ella..." -ForegroundColor Yellow
    git checkout $branchName | Out-Null
} else {
    git checkout -b $branchName | Out-Null
    Write-Host "  Rama creada y activa." -ForegroundColor Green
}

# ── 5. Mover el issue a "In Progress" en el Project ──────────────────────────
Write-Host ""
Write-Host "📋 Actualizando estado en GitHub Project..." -ForegroundColor Cyan

# Obtener el item-id del issue dentro del proyecto
$itemId = gh project item-list $PROJECT_NUM `
    --owner $OWNER `
    --format json `
    --jq ".items[] | select(.content.number == $issueNumber) | .id" 2>$null

if ($itemId) {
    # Obtener el option-id de "In Progress"
    $inProgressId = gh project field-list $PROJECT_NUM `
        --owner $OWNER `
        --format json `
        --jq '.fields[] | select(.name == "Status") | .options[] | select(.name == "In Progress") | .id' 2>$null

    if ($inProgressId) {
        gh project item-edit `
            --project-id PVT_kwHOB42opc4BhtJ7 `
            --id $itemId `
            --field-id $STATUS_FIELD_ID `
            --single-select-option-id $inProgressId | Out-Null
        Write-Host "  ✅ Status → In Progress" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  No se encontró la opción 'In Progress'. Actualiza el estado manualmente." -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠️  Issue no encontrado en el Project. Agrégalo manualmente si es necesario." -ForegroundColor Yellow
}

# ── 6. Asignar el issue al usuario actual ────────────────────────────────────
$me = gh api user --jq ".login"
gh issue edit $issueNumber --repo $REPO --add-assignee $me 2>$null | Out-Null

# ── Resumen ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✅ Historia iniciada: $StoryId" -ForegroundColor Green
Write-Host "  🌿 Rama activa: $branchName" -ForegroundColor Green
Write-Host "  🔗 Issue: $issueUrl" -ForegroundColor Green
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Cuando termines, ejecuta:" -ForegroundColor DarkGray
Write-Host "  .\scripts\finish-story.ps1 -StoryId $StoryId" -ForegroundColor White
Write-Host ""
