namespace Alamida.Calendar.Profiles;

/// <summary>Erkennung von Krematorien und Krankenhäusern — delegiert an <see cref="OrtErkennung"/>.</summary>
public static class OrtSchluesselwoerter
{
    public static void Apply(Core.Models.DispositionSettings settings) =>
        OrtErkennung.Apply(settings);

    public static bool IstKrematorium(string? ort) => OrtErkennung.IstKrematorium(ort);

    public static bool IstKrankenhaus(string? ort) => OrtErkennung.IstKrankenhaus(ort);
}
