$repo = (gh repo view --json nameWithOwner --jq ".nameWithOwner").Trim()

$csvPath = ".\app_finanzas_github_backlog.csv"

$rows = Import-Csv $csvPath

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " FINVOLT - BACKLOG IMPORT" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# -----------------------------------------
# 1. Crear labels necesarios
# -----------------------------------------

Write-Host "Checking labels..." -ForegroundColor Yellow

$allLabels = @()

foreach ($row in $rows) {
    $allLabels += ($row.Labels -split ",")
}

$allLabels = $allLabels |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -ne "" } |
    Sort-Object -Unique

foreach ($label in $allLabels) {

    gh label create $label `
        --repo $repo `
        --color "ededed" `
        --description "FinVolt backlog label" `
        2>$null

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Created label: $label" -ForegroundColor Green
    }
    else {
        Write-Host "Label already exists: $label" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "Labels ready." -ForegroundColor Green
Write-Host ""

# -----------------------------------------
# 2. Crear Issues
# -----------------------------------------

foreach ($row in $rows) {

    Write-Host "Creating $($row.ID) - $($row.Title)" -ForegroundColor Cyan

    $body = @"
## User Story

$($row.Description)

## Acceptance Criteria

$($row.'Acceptance Criteria')

## Dependencies

$($row.Dependencies)

## Metadata

- **ID:** $($row.ID)
- **Epic:** $($row.Epic)
- **Priority:** $($row.Priority)
"@

    $labels = $row.Labels -split ","

    $args = @(
        "issue",
        "create",
        "--repo", $repo,
        "--title", "[$($row.ID)] $($row.Title)",
        "--body", $body,
        "--project", "@Diego-CGTZ's untitled project"
    )

    foreach ($label in $labels) {

        $args += "--label"
        $args += $label.Trim()
    }

    $issueUrl = gh @args

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Created: $issueUrl" -ForegroundColor Green
    }
    else {
        Write-Host "ERROR creating $($row.ID)" -ForegroundColor Red
    }

    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " IMPORT FINISHED" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan