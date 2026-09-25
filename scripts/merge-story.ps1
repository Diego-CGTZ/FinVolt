##############################################################################
# merge-story.ps1
# Uso: .\scripts\merge-story.ps1 -StoryId US-009
#
# Qué hace:
#   1. Hace squash-merge del PR en main via GitHub CLI
#   2. Cierra el issue (el PR lo hace automáticamente con "Closes #N")
#   3. Mueve el item en el Project a "Done"
#   4. Elimina la rama remota y local
#   5. Pull de main para quedar actualizado
##############################################################################

param(
    [Parameter(Mandatory)]
    [string]$StoryId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Constantes ────────────────────────────────────────────────────────────────
$REPO        = "Diego-CGTZ/FinVolt"
$PROJECT_NUM = 1
$OWNER       = "Diego-CGTZ"
$STATUS_FIELD_ID = "PVTSSF_lAHOB42opc4BhtJ7zhgn6_o"

# ── 1. Buscar el PR abierto para esta historia ────────────────────────────────
Write-Host ""
Write-Host "🔍 Buscando PR para $StoryId..." -ForegroundColor Cyan

$prJson = gh pr list `
    --repo $REPO `
    --search "[$StoryId]" `
    --json number,url,headRefName `
    --limit 1 | ConvertFrom-Json

if (-not $prJson -or $prJson.Count -eq 0) {
    Write-Error "No se encontró PR abierto para $StoryId. ¿Ya fue mergeado o no fue creado?"
}

$pr           = $prJson[0]
$prNumber     = $pr.number
$prUrl        = $pr.url
$branchName   = $pr.headRefName

Write-Host "  PR #$prNumber en rama '$branchName'" -ForegroundColor Green

# ── 2. Squash-merge ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "🔀 Haciendo squash merge del PR #$prNumber..." -ForegroundColor Cyan

gh pr merge $prNumber `
    --repo $REPO `
    --squash `
    --delete-branch `
    --auto | Out-Null

Write-Host "  ✅ Merge completado y rama remota eliminada." -ForegroundColor Green

# ── 3. Actualizar el Project a "Done" ────────────────────────────────────────
Write-Host ""
Write-Host "📋 Actualizando Project a 'Done'..." -ForegroundColor Cyan

# Buscar el issue número desde el PR
$issueJson = gh issue list `
    --repo $REPO `
    --search "[$StoryId]" `
    --json number `
    --state closed `
    --limit 1 | ConvertFrom-Json

if (-not $issueJson -or $issueJson.Count -eq 0) {
    # Puede que aún no esté cerrado si el merge fue rápido; buscar también abiertos
    $issueJson = gh issue list `
        --repo $REPO `
        --search "[$StoryId]" `
        --json number `
        --limit 1 | ConvertFrom-Json
}

if ($issueJson -and $issueJson.Count -gt 0) {
    $issueNumber = $issueJson[0].number

    $itemId = gh project item-list $PROJECT_NUM `
        --owner $OWNER `
        --format json `
        --jq ".items[] | select(.content.number == $issueNumber) | .id" 2>$null

    if ($itemId) {
        $doneId = gh project field-list $PROJECT_NUM `
            --owner $OWNER `
            --format json `
            --jq '.fields[] | select(.name == "Status") | .options[] | select(.name == "Done") | .id' 2>$null

        if ($doneId) {
            gh project item-edit `
                --project-id PVT_kwHOB42opc4BhtJ7 `
                --id $itemId `
                --field-id $STATUS_FIELD_ID `
                --single-select-option-id $doneId | Out-Null
            Write-Host "  ✅ Status → Done" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  No se encontró opción 'Done'. Actualiza manualmente." -ForegroundColor Yellow
        }
    }
}

# ── 4. Eliminar rama local si existe ─────────────────────────────────────────
$localBranch = git branch --list $branchName
if ($localBranch) {
    git checkout main | Out-Null
    git branch -D $branchName | Out-Null
    Write-Host "  🗑️  Rama local '$branchName' eliminada." -ForegroundColor DarkGray
}

# ── 5. Pull de main ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "⬇️  Actualizando main..." -ForegroundColor Cyan
git checkout main | Out-Null
git pull origin main --quiet
Write-Host "  ✅ main actualizado." -ForegroundColor Green

# ── Resumen ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  🎉 Historia $StoryId COMPLETADA y mergeada" -ForegroundColor Green
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para iniciar la siguiente historia:" -ForegroundColor DarkGray
Write-Host "  .\scripts\start-story.ps1 -StoryId US-XXX" -ForegroundColor White
Write-Host ""
