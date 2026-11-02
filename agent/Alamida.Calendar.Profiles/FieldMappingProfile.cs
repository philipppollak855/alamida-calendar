using System.Text.Json;
using System.Text.Json.Serialization;

namespace Alamida.Calendar.Profiles;

public sealed class FieldMappingProfile
{
    public string Version { get; set; } = "9.2.1";
    public List<string> WindowTitlePatterns { get; set; } = [];
    public DetailmaskeConfig Detailmaske { get; set; } = new();
    public NeuerSterbefallMaskConfig NeuerSterbefall { get; set; } = new();
    public VorsorgeMaskConfig Vorsorge { get; set; } = new();

    public static FieldMappingProfile Load(string path)
    {
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<FieldMappingProfile>(json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidOperationException($"Mapping konnte nicht geladen werden: {path}");
    }
}

public sealed class DetailmaskeConfig
{
    [JsonPropertyName("ueberfuehrung")]
    public UeberfuehrungMaskConfig Ueberfuehrung { get; set; } = new();
}

public sealed class UeberfuehrungMaskConfig
{
    public List<string> WindowTitleContains { get; set; } = [];
    /// <summary>Anzahl Überführungszeilen im Termine-Layout (Alamida 9.2.1: 6).</summary>
    public int MaxEtappen { get; set; } = AlamidaEtappenFields.DefaultMaxEtappen;
    public Dictionary<string, FieldLocator> Fields { get; set; } = new();
}

public sealed class NeuerSterbefallMaskConfig
{
    public List<string> DetectNameContains { get; set; } = [];
    public List<string> DetectAutomationIdContains { get; set; } = [];
    public Dictionary<string, FieldLocator> Fields { get; set; } = new();
}

/// <summary>Maske „Vorsorgen → Termine“: Felder mit „{n}“ im Muster werden für Termin 1..MaxTermine ersetzt.</summary>
public sealed class VorsorgeMaskConfig
{
    public List<string> DetectAutomationIdContains { get; set; } = [];
    public int MaxTermine { get; set; } = 4;
    public FieldLocator Kopf { get; set; } = new();
    public Dictionary<string, FieldLocator> TerminFelder { get; set; } = new();

    public bool Aktiv => DetectAutomationIdContains.Count > 0 && TerminFelder.Count > 0;

    public Dictionary<string, FieldLocator> FelderFuer(int n) =>
        TerminFelder.ToDictionary(kv => kv.Key, kv => new FieldLocator
        {
            AutomationIdContains = kv.Value.AutomationIdContains.Select(x => x.Replace("{n}", n.ToString())).ToList(),
            AutomationIdExcludes = kv.Value.AutomationIdExcludes.Select(x => x.Replace("{n}", n.ToString())).ToList(),
            NameContains = kv.Value.NameContains.Select(x => x.Replace("{n}", n.ToString())).ToList(),
            ControlTypes = kv.Value.ControlTypes,
        });
}

public sealed class FieldLocator
{
    public List<string> AutomationIdContains { get; set; } = [];
    /// <summary>AutomationId darf keines dieser Teilstrings enthalten (z. B. Trauerfeier2 bei TF1).</summary>
    public List<string> AutomationIdExcludes { get; set; } = [];
    public List<string> NameContains { get; set; } = [];
    public List<string> ControlTypes { get; set; } = [];
}
