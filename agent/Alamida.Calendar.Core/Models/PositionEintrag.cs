namespace Alamida.Calendar.Core.Models;

public sealed class PositionEintrag
{
    public int Nummer { get; init; }
    /// <summary>sterbeort | abholung | ueberfuehrung | kremation</summary>
    public string Typ { get; init; } = "ueberfuehrung";
    public string? Ort { get; init; }
    public string? VonOrt { get; init; }
    public string? NachOrt { get; init; }
    public string? TerminAm { get; init; }
    public string? Kuehlraum { get; init; }
}
