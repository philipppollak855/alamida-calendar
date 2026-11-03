using System.Text.Json;

namespace Alamida.Calendar.Core.Models;

/// <summary>Überlagert die lokalen Kategorie-Einstellungen mit den Vorgaben aus der Web-App (GET /api/agent).</summary>
public static class ZentraleKonfiguration
{
    public static KategorieSettings Kopie(KategorieSettings k) => new()
    {
        Name = k.Name,
        Symbol = k.Symbol,
        CalendarId = k.CalendarId,
        ColorId = k.ColorId,
        DauerMinuten = k.DauerMinuten,
        Aktiv = k.Aktiv,
    };

    public static bool IstUnsichtbar(string? calendarId) =>
        string.IsNullOrWhiteSpace(calendarId) || calendarId.Trim().Equals("primary", StringComparison.OrdinalIgnoreCase);

    public static void Anwenden(
        string json,
        AgentConfig config,
        IReadOnlyDictionary<EventCategory, KategorieSettings> lokal,
        string lokalerKalender)
    {
        using var doc = JsonDocument.Parse(json);
        var r = doc.RootElement;
        var neu = lokal.ToDictionary(kv => kv.Key, kv => Kopie(kv.Value));
        foreach (var (kat, std) in KategorieSettings.Defaults())
            neu.TryAdd(kat, std);

        if (r.TryGetProperty("kategorien", out var ks) && ks.ValueKind == JsonValueKind.Object)
        {
            foreach (var p in ks.EnumerateObject())
            {
                if (!Enum.TryParse<EventCategory>(p.Name, true, out var kat) || !neu.TryGetValue(kat, out var k)) continue;
                if (p.Value.ValueKind != JsonValueKind.Object) continue;
                if (p.Value.TryGetProperty("calendarId", out var c) && c.ValueKind == JsonValueKind.String
                    && !string.IsNullOrWhiteSpace(c.GetString()))
                    k.CalendarId = c.GetString()!.Trim();
                if (p.Value.TryGetProperty("dauerMinuten", out var d) && d.ValueKind == JsonValueKind.Number
                    && d.TryGetInt32(out var m) && m is >= 15 and <= 1440)
                    k.DauerMinuten = m;
                if (p.Value.TryGetProperty("aktiv", out var a) && a.ValueKind is JsonValueKind.True or JsonValueKind.False)
                    k.Aktiv = a.GetBoolean();
            }
        }

        string? Text(string name) =>
            r.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString())
                ? v.GetString()!.Trim()
                : null;

        config.CalendarId = Text("standardKalender")
            ?? (IstUnsichtbar(lokalerKalender) ? Text("ersatzKalender") : null)
            ?? lokalerKalender;
        config.Kategorien = neu;
    }
}
