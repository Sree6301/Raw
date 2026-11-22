; ==============================================================================
; SMART XEROX HUB - WINDOWS 11 AGENT INSTALLER SCRIPT
; Compiler: Inno Setup 6+
; Target: Windows 11 / Windows 10 (x64)
; ==============================================================================

#define MyAppName "Smart Xerox Hub - Windows Agent"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Smart Xerox Hub Ecosystem"
#define MyAppURL "https://smartxeroxhub.local"
#define MyAppExeName "SmartXeroxHubAgent.exe"

[Setup]
AppId={{5E97D45A-8E4B-4E38-92E1-65D3C1F4A0B2}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\Smart Xerox Hub
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=releases
OutputBaseFilename=SmartXeroxHubAgent-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0.17763
SetupIconFile=..\windows-agent\Assets\app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
PrivilegesRequired=lowest

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startupicon"; Description: "Launch Smart Xerox Hub automatically when signing in to Windows"; GroupDescription: "Windows Startup:"

[Files]
Source: "..\windows-agent\bin\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Configure optional Windows automatic startup for current user
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "SmartXeroxHubAgent"; ValueData: """{app}\{#MyAppExeName}"" --background"; Flags: uninsdeletevalue; Tasks: startupicon

[Dirs]
Name: "{app}\RAW_Inputs"; Flags: uninsneveruninstall
Name: "{app}\RAW_Inputs\User_Uploads"; Flags: uninsneveruninstall
Name: "{app}\RAW_Inputs\Scans"; Flags: uninsneveruninstall
Name: "{app}\RAW_Inputs\Duplex"; Flags: uninsneveruninstall
Name: "{localappdata}\SmartXeroxHub"; Flags: uninsneveruninstall
Name: "{localappdata}\SmartXeroxHub\logs"; Flags: uninsneveruninstall
Name: "{localappdata}\SmartXeroxHub\scans"; Flags: uninsneveruninstall
Name: "{localappdata}\SmartXeroxHub\duplex_jobs"; Flags: uninsneveruninstall
Name: "{localappdata}\SmartXeroxHub\downloads"; Flags: uninsneveruninstall
Name: "{localappdata}\SmartXeroxHub\temp"; Flags: uninsneveruninstall

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
