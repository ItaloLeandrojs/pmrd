# Cria a tarefa "PMRD importador" no Agendador de Tarefas do Windows:
# de hora em hora, das 6h às 22h, só com o usuário logado, sem janela.
$ErrorActionPreference = 'Stop'

$uv = Join-Path $env:USERPROFILE '.local\bin\uv.exe'
$pasta = $PSScriptRoot
if (-not (Test-Path $uv)) { throw "uv não encontrado em $uv" }

$argumentos = "run --project `"$pasta`" pmrd-importar"
Write-Host "A tarefa vai rodar este comando de hora em hora, das 6h às 22h:"
Write-Host "  `"$uv`" $argumentos"
Read-Host "Aperte Enter para criar a tarefa (ou feche a janela para cancelar)" | Out-Null

# Roda minimizado e sem janela: o PowerShell oculto chama o uv.
$cmd = "& `"$uv`" $argumentos"
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -Command `"$($cmd.Replace('"','\"'))`"" `
    -WorkingDirectory $pasta

# Primeiro disparo às 6h, repetindo de hora em hora por 16 horas (até 22h).
$gatilho = New-ScheduledTaskTrigger -Daily -At '06:00'
$gatilho.Repetition = (New-ScheduledTaskTrigger -Once -At '06:00' `
    -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Hours 16)).Repetition

# Só com o usuário logado (LogonType Interactive), sem pedir senha.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName 'PMRD importador' -Action $acao -Trigger $gatilho `
    -Principal $principal -Settings $config -Force | Out-Null
Write-Host "Pronto. Tarefa 'PMRD importador' criada."
