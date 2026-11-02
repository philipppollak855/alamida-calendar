namespace Alamida.Calendar.Core.Models;

public sealed class DispositionSettings
{
    public List<string> KremationPrefixe { get; init; } = [];
    public List<string> KremationKeywords { get; init; } = [];
    public List<string> KrankenhausPrefixe { get; init; } = [];
    public List<string> KrankenhausKeywords { get; init; } = [];
    public List<string> PflegeheimPrefixe { get; init; } = [];
    public List<string> PflegeheimKeywords { get; init; } = [];
    public List<string> BestattungPrefixe { get; init; } = [];
    public List<string> BestattungKeywords { get; init; } = [];
    public List<EigenerKuehlraumConfig> EigeneKuehlraeume { get; init; } = [];

    public static DispositionSettings Default => new()
    {
        KremationPrefixe = [],
        KremationKeywords =
        [
            "krematorium", "innermanzing", "feba", "kremation", "einäscherung",
            "einaescherung", "feuerbestattung", "einäscherungsanlage",
        ],
        KrankenhausPrefixe = ["UK ", "UK-", "KH ", "KH-", "KH."],
        KrankenhausKeywords = ["krankenhaus", "spital", "klinik", "landesklinik"],
        PflegeheimPrefixe = ["Senecura"],
        PflegeheimKeywords = ["senecura", "pflegeheim", "altenheim", "hospiz", "pflege"],
        BestattungPrefixe = [],
        BestattungKeywords = ["bestattung", "bestatter", "trauerhalle", "bestattungsinstitut"],
        EigeneKuehlraeume =
        [
            new EigenerKuehlraumConfig
            {
                Id = "grafenbach",
                Label = "Firmenkühlraum Grafenbach",
                AlamidaName = "Kühlr. Grafenbach",
                MatchKeywords =
                [
                    "grafenbach", "kühlr. grafenbach", "kuehlr. grafenbach",
                    "kühl. grafenbach", "kuehl. grafenbach",
                ],
                Plaetze = 9,
            },
        ],
    };
}

public sealed class EigenerKuehlraumConfig
{
    public string Id { get; init; } = "";
    public string Label { get; init; } = "";
    public string? AlamidaName { get; init; }
    public List<string> MatchKeywords { get; init; } = [];
    public List<string> ExternKeywords { get; init; } = [];
    public string WandTab { get; init; } = "kuehlraum";
    public int Plaetze { get; init; } = 9;
}
