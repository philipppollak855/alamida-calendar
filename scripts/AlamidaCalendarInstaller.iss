; Alamida Kalender Agent - Inno Setup Installer
; Erstellt eine professionelle Windows-Installer-EXE

#define AppName "Alamida Kalender Agent"
#define AppVersion "1.0.0"
#define AppPublisher "Bestattungsfirma"
#define AppExeName "AlamidaCalendarAgent.exe"
#define AppPublisherName "Bestattungsfirma"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={commonpf}\AlamidaCalendar
DefaultGroupName={#AppName}
AllowNoIcons=yes
OutputDir=..\dist\installer
OutputBaseFilename=AlamidaCalendarAgent-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
DisableDirPage=no
DisableProgramGroupPage=yes
DisableReadyPage=no
UninstallDisplayIcon={app}\{#AppExeName}
CreateAppDir=yes
PrivilegesRequired=admin
UsePreviousAppDir=yes
UsePreviousGroup=yes

[Languages]
Name: "deutsch"; MessagesFile: "compiler:Languages\German.isl"

[Tasks]
Name: "desktopicon"; Description: "Desktop-Verknüpfung erstellen"; GroupDescription: "Zusätzliche Symbole:"
Name: "autostart"; Description: "Autostart beim Windows-Start"; GroupDescription: "Zusätzliche Optionen:"

[Files]
; Agent-Dateien
Source: "..\agent\Alamida.Calendar.Agent\bin\Release\net8.0-windows\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Field-Mapping
Source: "..\docs\field-mapping-9.2.1.json"; DestDir: "{app}"; Flags: ignoreversion
; AppSettings
Source: "..\agent\Alamida.Calendar.Agent\appsettings.json"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Alamida Kalender Agent"; Filename: "{app}\{#AppExeName}"
Name: "{group}\Status anzeigen"; Filename: "{app}\{#AppExeName}"; Parameters: "--status"
Name: "{group}\Deinstallieren"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Alamida Kalender Agent"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Alamida Kalender Agent starten"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Registry]
; Autostart-Registrierung
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "AlamidaCalendarAgent"; ValueData: """{app}\{#AppExeName}"""; Flags: uninsdeletevalue; Tasks: autostart

[Code]
function GetGoogleCalendarJSON(Param: String): String;
var
  SaveDialog: TSaveDialog;
begin
  SaveDialog := TSaveDialog.Create(nil);
  try
    SaveDialog.Title := 'Google Calendar Service Account JSON speichern';
    SaveDialog.Filter := 'JSON-Dateien (*.json)|*.json|Alle Dateien (*.*)|*.*';
    SaveDialog.DefaultExt := 'json';
    SaveDialog.FileName := 'service-account.json';
    SaveDialog.InitialDir := ExpandConstant('{userappdata}\AlamidaCalendar');
    
    if SaveDialog.Execute then
      Result := SaveDialog.FileName
    else
      Result := '';
  finally
    SaveDialog.Free;
  end;
end;

function InitializeSetup(): Boolean;
var
  AppDataDir: String;
begin
  AppDataDir := ExpandConstant('{userappdata}\AlamidaCalendar');
  if not DirExists(AppDataDir) then
    ForceDirectories(AppDataDir);
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  GoogleJSONPath: String;
  AppDataDir: String;
  ServiceAccountPath: String;
begin
  if CurStep = ssPostInstall then
  begin
    AppDataDir := ExpandConstant('{userappdata}\AlamidaCalendar');
    ServiceAccountPath := AppDataDir + '\service-account.json';
    
    if not FileExists(ServiceAccountPath) then
    begin
      if MsgBox('Möchten Sie jetzt die Google Calendar Service Account JSON-Datei konfigurieren?' + #13#10 + #13#10 +
                'Dies ist erforderlich für die Synchronisation mit Google Calendar.' + #13#10 +
                'Sie können dies auch später manuell nachholen.', mbConfirmation, MB_YESNO) = IDYES then
      begin
        GoogleJSONPath := GetGoogleCalendarJSON('');
        if GoogleJSONPath <> '' then
        begin
          // Datei wird vom User über den Dialog gespeichert
          MsgBox('Service Account JSON wurde gespeichert.' + #13#10 + #13#10 +
                'Vergessen Sie nicht, den Kalender in Google Calendar für das Service Account freizugeben.' + #13#10 +
                'Siehe setup\GOOGLE-CALENDAR-SETUP.txt für Details.', mbInformation, MB_OK);
        end;
      end;
    end;
  end;
end;
