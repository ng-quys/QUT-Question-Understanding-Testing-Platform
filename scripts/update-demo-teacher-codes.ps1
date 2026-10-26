param([switch]$Apply,[switch]$AllowUnlinkedDemo)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$previousJavaHome=$env:JAVA_HOME
Push-Location $projectRoot
try {
    $toolDir=Join-Path $projectRoot '.qut-run/teacher-code-tool'
    New-Item -ItemType Directory -Force -Path $toolDir | Out-Null
    $cpFile=Join-Path $toolDir 'classpath.txt'
    if(-not $env:JAVA_HOME -and (Test-Path 'C:/Tools/jdk-17.0.12')){$env:JAVA_HOME='C:/Tools/jdk-17.0.12'}
    $maven=Get-Command mvn.cmd -ErrorAction SilentlyContinue
    if ($maven) { & $maven.Source -q -f backend/pom.xml dependency:build-classpath "-Dmdep.outputFile=$cpFile" }
    elseif (Test-Path 'C:/Tools/apache-maven-3.9.10/bin/mvn.cmd') { & 'C:/Tools/apache-maven-3.9.10/bin/mvn.cmd' -q -f backend/pom.xml dependency:build-classpath "-Dmdep.outputFile=$cpFile" }
    else { & './backend/mvnw.cmd' -q -f backend/pom.xml dependency:build-classpath "-Dmdep.outputFile=$cpFile" }
    if($LASTEXITCODE -ne 0){throw 'Cannot resolve project dependencies.'}
    $jdk=$env:JAVA_HOME
    if(-not $jdk -and (Test-Path 'C:/Tools/jdk-17.0.12')){$jdk='C:/Tools/jdk-17.0.12'}
    if(-not $jdk){throw 'Set JAVA_HOME to a JDK 17 or later.'}
    $classpath=(Get-Content -LiteralPath $cpFile -Raw).Trim()
    & (Join-Path $jdk 'bin/javac.exe') -encoding UTF-8 -d $toolDir -cp $classpath scripts/UpdateDemoTeacherCodes.java
    if($LASTEXITCODE -ne 0){throw 'Cannot compile teacher-code migration helper.'}
    $mode=if($Apply){'--apply'}else{'--plan'}
    $migrationArgs=@($mode)
    if($AllowUnlinkedDemo){if(-not $Apply){throw 'AllowUnlinkedDemo requires Apply.'};$migrationArgs+='--allow-unlinked-demo'}
    & (Join-Path $jdk 'bin/java.exe') "-Djdk.net.unixdomain.tmpdir=$projectRoot/.qut-run" -cp "$toolDir;$classpath" UpdateDemoTeacherCodes @migrationArgs
    if($LASTEXITCODE -ne 0){throw 'Teacher-code migration did not complete. See the sanitized status above.'}
} finally { $env:JAVA_HOME=$previousJavaHome; Pop-Location }
