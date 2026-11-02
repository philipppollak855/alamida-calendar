namespace Alamida.Calendar.Core.Models;

/// <summary>
/// Eine Überführungszeile aus Alamida (Termin_Überführung{n}_Text/Datum).
/// </summary>
public sealed class UeberfuehrungSchritt
{
    /// <summary>FileMaker-Zeile 1..6 (1 = Abholung im UI).</summary>
    public int Zeile { get; init; }

    /// <summary>abholung | ueberfuehrung | kremation</summary>
    public string SchrittTyp { get; init; } = "ueberfuehrung";

    public string? VonOrt { get; init; }
    public string? NachOrt { get; init; }
    public string? TerminAm { get; init; }
    public string? Kuehlraum { get; init; }

    public bool HasRoute =>
        !string.IsNullOrWhiteSpace(VonOrt) || !string.IsNullOrWhiteSpace(NachOrt);
}
