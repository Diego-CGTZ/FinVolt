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
$ErrorActionPreference = "Continue"

# ── Constantes del proyecto ──────────────────────────────────────────────────
$REPO            = "Diego-CGTZ/FinVolt"
$PROJECT_NUM     = 1
$OWNER           = "Diego-CGTZ"
$STATUS_FIELD_ID = "PVTSSF_lAHOB42opc4BhtJ7zhgn6_o"
$STATUS_IN_REVIEW = "f4685eee"

# ── 1. Verificar que estamos en la rama correcta ──────────────────────────────
$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -notlike ("*" + $StoryId + "*")) {
    Write-Warning ("La rama actual es '{0}', que no coincide con {1}." -f $currentBranch, $StoryId)
    $confirm = Read-Host "Continuar de todas formas? (s/N)"
    if ($confirm -ne "s") { exit 1 }
}

# ── 2. Buscar el issue ───────────────────────────────────────────────────────
Write-Host ""
Write-Host ("Buscando issue {0}..." -f $StoryId) -ForegroundColor Cyan

$issueJson = gh issue list `
    --repo $REPO `
    --search ("[" + $StoryId + "]") `
    --json number,title,url `
    --limit 1 | ConvertFrom-Json

if (-not $issueJson -or $issueJson.Count -eq 0) {
    Write-Error ("No se encontro issue [{0}]." -f $StoryId)
    exit 1
}

$issue        = $issueJson[0]
$issueNumber  = $issue.number
$issueTitle   = $issue.title
$issueUrl     = $issue.url

Write-Host ("  Issue #{0}: {1}" -f $issueNumber, $issueTitle) -ForegroundColor Green

# ── 3. Push de la rama ────────────────────────────────────────────────────────
Write-Host ""
Write-Host ("Haciendo push de '{0}'..." -f $currentBranch) -ForegroundColor Cyan
git push -u origin $currentBranch

# ── 4. Crear o detectar el Pull Request ──────────────────────────────────────
Write-Host ""
Write-Host "Creando Pull Request..." -ForegroundColor Cyan

# Detectar si ya existe un PR para esta rama
$existingPr = gh pr list `
    --repo $REPO `
    --head $currentBranch `
    --json url `
    --limit 1 | ConvertFrom-Json

if ($existingPr -and $existingPr.Count -gt 0) {
    $prUrl = $existingPr[0].url
    Write-Host ("  PR ya existia: {0}" -f $prUrl) -ForegroundColor Yellow
} else {
    $cleanTitle = $issueTitle -replace '^\[.*?\]\s*', ''
    $prTitle    = ("[{0}] {1}" -f $StoryId, $cleanTitle)

    $prBody = ("## Closes #{0}`n`n" +
               "**Historia:** {1}`n`n" +
               "### Que cambia?`n" +
               "<!-- Describe brevemente los cambios -->`n`n" +
               "### Checklist de pruebas`n" +
               "- [ ] Funciona en Android`n" +
               "- [ ] No hay errores de TypeScript (npx tsc --noEmit)`n" +
               "- [ ] Lint limpio (npx expo lint)`n" +
               "- [ ] Criterios de aceptacion de la historia cumplidos`n") -f $issueNumber, $issueTitle

    $prUrl = gh pr create `
        --repo $REPO `
        --base main `
        --head $currentBranch `
        --title $prTitle `
        --body $prBody

    Write-Host ("  PR creado: {0}" -f $prUrl) -ForegroundColor Green
}

# ── 5. Mover el issue a "In Review" ──────────────────────────────────────────
Write-Host ""
Write-Host "Actualizando estado del Project a 'In Review'..." -ForegroundColor Cyan

$itemId = gh project item-list $PROJECT_NUM `
    --owner $OWNER `
    --format json `
    --jq (".items[] | select(.content.number == " + $issueNumber + ") | .id") 2>$null

if ($itemId) {
    gh project item-edit `
        --project-id PVT_kwHOB42opc4BhtJ7 `
        --id $itemId `
        --field-id $STATUS_FIELD_ID `
        --single-select-option-id $STATUS_IN_REVIEW | Out-Null
    Write-Host "  Status -> In Review" -ForegroundColor Green
} else {
    Write-Host "  AVISO: Issue no encontrado en el Project. Actualiza manualmente." -ForegroundColor Yellow
}

# ── Resumen ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ("  Historia lista para revision: {0}" -f $StoryId) -ForegroundColor Green
Write-Host ("  PR: {0}" -f $prUrl) -ForegroundColor Green
Write-Host ("  Issue: {0}" -f $issueUrl) -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Prueba la app. Cuando todo funcione, ejecuta:" -ForegroundColor DarkGray
Write-Host ("  .\scripts\merge-story.ps1 -StoryId {0}" -f $StoryId) -ForegroundColor White
Write-Host ""
