namespace Alamida.Calendar.Core.Models;

public sealed class AusstehendeUeberfuehrung
{
    public int Zeile { get; init; }
    public string SchrittTyp { get; init; } = "ueberfuehrung";
    public string? VonOrt { get; init; }
    public string? NachOrt { get; init; }
    public string? TerminAm { get; init; }
    public string Status { get; init; } = "geplant";
    public bool IstAbholungVomSterbeort { get; init; }
}
