##############################################################################
# finish-story.ps1
# Uso: .\scripts\finish-story.ps1 -StoryId US-009
#
# Qué hace:
#   1. Hace push de la rama al remoto
#   2. Abre un Pull Request vinculado al issue
#   3. Mueve el issue a "In Review" en el GitHub Project
#   4. Imprime el link del PR para que puedas revisarlo / mergearlo cuando
#      hayas probado que todo funciona
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
$STATUS_FIELD_ID = "PVTSSF_lAHOB42opc4BhtJ7zhgn6_o"

# ── 1. Verificar que estamos en la rama correcta ──────────────────────────────
$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -notlike "*$StoryId*") {
    Write-Warning "La rama actual es '$currentBranch', que no coincide con $StoryId."
    $confirm = Read-Host "¿Continuar de todas formas? (s/N)"
    if ($confirm -ne "s") { exit 1 }
}

# ── 2. Buscar el issue ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "🔍 Buscando issue $StoryId..." -ForegroundColor Cyan

$issueJson = gh issue list `
    --repo $REPO `
    --search "[$StoryId]" `
    --json number,title,url `
    --limit 1 | ConvertFrom-Json

if (-not $issueJson -or $issueJson.Count -eq 0) {
    Write-Error "No se encontró issue [$StoryId]."
}

$issue        = $issueJson[0]
$issueNumber  = $issue.number
$issueTitle   = $issue.title
$issueUrl     = $issue.url

Write-Host "  Issue #$issueNumber: $issueTitle" -ForegroundColor Green

# ── 3. Push de la rama ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "⬆️  Haciendo push de '$currentBranch'..." -ForegroundColor Cyan
git push -u origin $currentBranch

# ── 4. Crear el Pull Request ──────────────────────────────────────────────────
Write-Host ""
Write-Host "🔀 Creando Pull Request..." -ForegroundColor Cyan

$prBody = @"
## Closes #$issueNumber

**Historia:** $issueTitle

### ¿Qué cambia?
<!-- Describe brevemente los cambios -->

### Checklist de pruebas
<!-- Marca lo que verificaste antes de hacer merge -->
- [ ] Funciona en Android
- [ ] No hay errores de TypeScript (`npx tsc --noEmit`)
- [ ] Lint limpio (`npx expo lint`)
- [ ] Criterios de aceptación de la historia cumplidos
"@

$prUrl = gh pr create `
    --repo $REPO `
    --base main `
    --head $currentBranch `
    --title "[$StoryId] $($issueTitle -replace '^\[.*?\]\s*', '')" `
    --body $prBody

Write-Host "  PR creado: $prUrl" -ForegroundColor Green

# ── 5. Mover el issue a "In Review" ──────────────────────────────────────────
Write-Host ""
Write-Host "📋 Actualizando estado del Project a 'In Review'..." -ForegroundColor Cyan

$itemId = gh project item-list $PROJECT_NUM `
    --owner $OWNER `
    --format json `
    --jq ".items[] | select(.content.number == $issueNumber) | .id" 2>$null

if ($itemId) {
    $inReviewId = gh project field-list $PROJECT_NUM `
        --owner $OWNER `
        --format json `
        --jq '.fields[] | select(.name == "Status") | .options[] | select(.name | test("Review|review")) | .id' 2>$null

    if ($inReviewId) {
        gh project item-edit `
            --project-id PVT_kwHOB42opc4BhtJ7 `
            --id $itemId `
            --field-id $STATUS_FIELD_ID `
            --single-select-option-id $inReviewId | Out-Null
        Write-Host "  ✅ Status → In Review" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  No se encontró 'In Review'. Actualiza manualmente." -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠️  Issue no encontrado en el Project." -ForegroundColor Yellow
}

# ── Resumen ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✅ Historia lista para revisión: $StoryId" -ForegroundColor Green
Write-Host "  🔀 PR: $prUrl" -ForegroundColor Green
Write-Host "  🔗 Issue: $issueUrl" -ForegroundColor Green
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Prueba la app. Cuando todo funcione, ejecuta:" -ForegroundColor DarkGray
Write-Host "  .\scripts\merge-story.ps1 -StoryId $StoryId" -ForegroundColor White
Write-Host ""
