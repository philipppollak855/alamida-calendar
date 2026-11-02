namespace Alamida.Calendar.Profiles;

public enum BestattungsArt
{
    Unbekannt,
    Erdbestattung,
    Urne,
}

public static class BestattungsartResolver
{
    public static (BestattungsArt Art, string? Endziel, string EndzielTyp) Resolve(
        string? bestattungsart,
        string? beisetzungsort,
        string? krematoriumOrt,
        string? feuerbestattungOrt)
    {
        var artText = (bestattungsart ?? "").Trim();
        var lower = artText.ToLowerInvariant();

        if (IsUrn(lower, krematoriumOrt, feuerbestattungOrt))
        {
            var ziel = FirstNonEmpty(krematoriumOrt, feuerbestattungOrt) ?? "Krematorium";
            return (BestattungsArt.Urne, ziel, "krematorium");
        }

        if (lower.Contains("erd") || lower.Contains("beerdigung") || lower.Contains("sarg"))
            return (BestattungsArt.Erdbestattung, beisetzungsort, "beisetzung");

        if (!string.IsNullOrWhiteSpace(beisetzungsort))
            return (BestattungsArt.Erdbestattung, beisetzungsort.Trim(), "beisetzung");

        return (BestattungsArt.Unbekannt, beisetzungsort ?? krematoriumOrt, "unbekannt");
    }

    private static bool IsUrn(string lowerArt, string? krem, string? feuer)
    {
        if (lowerArt.Contains("urne") || lowerArt.Contains("feuer") || lowerArt.Contains("kremation"))
            return true;

        if (OrtSchluesselwoerter.IstKrematorium(krem) || OrtSchluesselwoerter.IstKrematorium(feuer))
            return true;

        if (OrtSchluesselwoerter.IstKrematorium(lowerArt))
            return true;

        return false;
    }

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var v in values)
            if (!string.IsNullOrWhiteSpace(v)) return v.Trim();
        return null;
    }
}
