param(
  [ValidateSet(1, 2)]
  [int]$Ocpus = 2,
  [ValidateSet(6, 12)]
  [int]$MemoryInGBs = 12
)

$ErrorActionPreference = "Stop"
$env:SUPPRESS_LABEL_WARNING = "True"
$env:OCI_CLI_SUPPRESS_FILE_PERMISSIONS_WARNING = "True"

$ociConfig = Join-Path $env:USERPROFILE ".oci\config"
$sshKey = Join-Path $env:USERPROFILE ".ssh\oracle-9router.pub"
if (!(Test-Path -LiteralPath $ociConfig) -or !(Test-Path -LiteralPath $sshKey)) {
  throw "OCI config or oracle-9router.pub is missing."
}

$compartmentId = (Get-Content -LiteralPath $ociConfig |
  Select-String '^tenancy=' | ForEach-Object { ($_.Line -split '=', 2)[1].Trim() })
$existing = oci compute instance list --compartment-id $compartmentId `
  --display-name bombpvp-game --all `
  --query 'data[?"lifecycle-state"!=`TERMINATED`] | length(@)' --raw-output 2>$null
if ([int]$existing -gt 0) {
  Write-Host "bombpvp-game already exists; no duplicate was created."
  exit 0
}

$availabilityDomain = oci iam availability-domain list `
  --query 'data[0].name' --raw-output 2>$null
$bootVolumes = oci bv boot-volume list --availability-domain $availabilityDomain `
  --compartment-id $compartmentId --all --output json 2>$null | ConvertFrom-Json
$usedStorage = ($bootVolumes.data | Where-Object { $_.'lifecycle-state' -ne 'TERMINATED' } |
  Measure-Object -Property 'size-in-gbs' -Sum).Sum
if (($usedStorage + 50) -gt 200) {
  throw "A 50 GB boot volume would exceed the 200 GB Always Free block-volume allowance."
}

$subnetId = oci network subnet list --compartment-id $compartmentId --all `
  --query 'data[?"display-name"==`subnet-20260508-1404`] | [0].id' --raw-output 2>$null
$imageId = oci compute image list --compartment-id $compartmentId `
  --operating-system 'Canonical Ubuntu' --operating-system-version 24.04 `
  --shape VM.Standard.A1.Flex --sort-by TIMECREATED --sort-order DESC --all `
  --query 'data[0].id' --raw-output 2>$null
$shapeConfig = "{`"ocpus`":$Ocpus,`"memoryInGBs`":$MemoryInGBs}"
$tags = '{"project":"bombpvp","role":"authoritative-game-server","billing":"always-free"}'

foreach ($faultDomain in @("FAULT-DOMAIN-1", "FAULT-DOMAIN-2", "FAULT-DOMAIN-3")) {
  Write-Host "Trying $faultDomain with $Ocpus OCPU / $MemoryInGBs GB..."
  $result = oci compute instance launch `
    --availability-domain $availabilityDomain --fault-domain $faultDomain `
    --compartment-id $compartmentId --display-name bombpvp-game `
    --shape VM.Standard.A1.Flex --shape-config $shapeConfig --image-id $imageId `
    --subnet-id $subnetId --assign-public-ip true --boot-volume-size-in-gbs 50 `
    --ssh-authorized-keys-file $sshKey --freeform-tags $tags --output json 2>&1
  if ($LASTEXITCODE -eq 0) {
    $instance = $result | ConvertFrom-Json
    Write-Host "Created $($instance.data.'display-name') in ${faultDomain}: $($instance.data.id)"
    exit 0
  }
  if (($result -join "`n") -notmatch "Out of host capacity|Out of capacity") {
    throw ($result -join "`n")
  }
}

throw "Oracle São Paulo has no VM.Standard.A1.Flex host capacity in any fault domain. Retry later."
