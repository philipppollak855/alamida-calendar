using System.Text.Json;
using System.Text.Json.Serialization;

namespace Alamida.Calendar.Profiles;

public sealed class FieldMappingProfile
{
    public string Version { get; set; } = "9.2.1";
    public List<string> WindowTitlePatterns { get; set; } = [];
    public DetailmaskeConfig Detailmaske { get; set; } = new();
    public NeuerSterbefallMaskConfig NeuerSterbefall { get; set; } = new();

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

public sealed class FieldLocator
{
    public List<string> AutomationIdContains { get; set; } = [];
    /// <summary>AutomationId darf keines dieser Teilstrings enthalten (z. B. Trauerfeier2 bei TF1).</summary>
    public List<string> AutomationIdExcludes { get; set; } = [];
    public List<string> NameContains { get; set; } = [];
    public List<string> ControlTypes { get; set; } = [];
}
