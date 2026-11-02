namespace Alamida.Calendar.Core.Models;

/// <summary>Ein Termin aus der Alamida-Maske „Vorsorgen → Termine“ (Felder 1–4).</summary>
public sealed record VorsorgeTermin
{
    public int Nummer { get; init; }
    public string? Datum { get; init; }
    public string? Zeit { get; init; }
    public string? Ort { get; init; }
    public string? Notiz { get; init; }
}
