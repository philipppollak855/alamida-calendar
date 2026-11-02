using System.Text.Json;

namespace Alamida.Calendar.Core.GoogleCalendar;

/// <summary>Merkt sich pro Sterbefall, welche Termine in welchem Kalender stehen (ueberlebt Neustarts).</summary>
public sealed class SyncState
{
    public Dictionary<string, FallEintrag> Faelle { get; set; } = new();

    public int AnzahlTermine => Faelle.Values.Sum(f => f.Termine.Count);

    public static SyncState Load(string path)
    {
        try
        {
            if (File.Exists(path))
                return JsonSerializer.Deserialize<SyncState>(File.ReadAllText(path)) ?? new SyncState();
        }
        catch (Exception)
        {
        }
        return new SyncState();
    }

    public void Save(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tmp = path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
        File.Move(tmp, path, overwrite: true);
    }

    public sealed class FallEintrag
    {
        public string Hash { get; set; } = "";

        /// <summary>Termin-Schluessel -> Kalender-ID.</summary>
        public Dictionary<string, string> Termine { get; set; } = new();

        public DateTime Aktualisiert { get; set; }
    }
}
