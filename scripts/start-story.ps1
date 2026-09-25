##############################################################################
# start-story.ps1
# Uso: .\scripts\start-story.ps1 -StoryId US-009
##############################################################################

param(
    [Parameter(Mandatory)]
    [string]$StoryId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

# ── Constantes ────────────────────────────────────────────────────────────────
$REPO            = "Diego-CGTZ/FinVolt"
$PROJECT_NUM     = 1
$OWNER           = "Diego-CGTZ"
$STATUS_FIELD_ID      = "PVTSSF_lAHOB42opc4BhtJ7zhgn6_o"
$STATUS_IN_PROGRESS  = "47fc9ee4"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Get-SlugFromIssue([string]$title) {
    $clean = $title -replace '^\[.*?\]\s*', '' `
                    -replace '[^a-zA-Z0-9\s]', '' `
                    -replace '\s+', '-'
    $lower = $clean.ToLower()
    return $lower.Substring(0, [Math]::Min(40, $lower.Length))
}

# ── 1. Buscar el issue ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Buscando issue ${StoryId} en GitHub..." -ForegroundColor Cyan

$issueJson = gh issue list `
    --repo $REPO `
    --search "[${StoryId}]" `
    --json number,title,url `
    --limit 1 | ConvertFrom-Json

if (-not $issueJson -or $issueJson.Count -eq 0) {
    Write-Error "No se encontro un issue con el titulo [${StoryId}]. Ya fue importado el backlog?"
}

$issue       = $issueJson[0]
$issueNumber = $issue.number
$issueTitle  = $issue.title
$issueUrl    = $issue.url

Write-Host ("  Issue #{0}: {1}" -f $issueNumber, $issueTitle) -ForegroundColor Green

# ── 2. Nombre de rama ─────────────────────────────────────────────────────────
$slug       = Get-SlugFromIssue $issueTitle
$branchName = "feature/${StoryId}-${slug}"

Write-Host ""
Write-Host "Rama: ${branchName}" -ForegroundColor Cyan

# ── 3. Asegurarse en main actualizado ─────────────────────────────────────────
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

# ── 5. Mover a "In Progress" en el Project ────────────────────────────────────
Write-Host ""
Write-Host "Actualizando GitHub Project..." -ForegroundColor Cyan

$itemId = gh project item-list $PROJECT_NUM `
    --owner $OWNER `
    --format json `
    --jq (".items[] | select(.content.number == " + $issueNumber + ") | .id") 2>$null

if ($itemId) {
    gh project item-edit `
        --project-id PVT_kwHOB42opc4BhtJ7 `
        --id $itemId `
        --field-id $STATUS_FIELD_ID `
        --single-select-option-id $STATUS_IN_PROGRESS | Out-Null
    Write-Host "  Status -> In Progress" -ForegroundColor Green
} else {
    Write-Host "  AVISO: Issue no encontrado en el Project." -ForegroundColor Yellow
}

# ── 6. Asignar el issue ───────────────────────────────────────────────────────
$me = gh api user --jq ".login"
gh issue edit $issueNumber --repo $REPO --add-assignee $me 2>$null | Out-Null

# ── Resumen ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ("  Historia iniciada: {0}" -f $StoryId) -ForegroundColor Green
Write-Host ("  Rama activa: {0}" -f $branchName) -ForegroundColor Green
Write-Host ("  Issue: {0}" -f $issueUrl) -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Cuando termines, ejecuta:" -ForegroundColor DarkGray
Write-Host ("  .\scripts\finish-story.ps1 -StoryId {0}" -f $StoryId) -ForegroundColor White
Write-Host ""
