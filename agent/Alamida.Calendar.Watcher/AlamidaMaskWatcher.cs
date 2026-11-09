using Alamida.Calendar.Core.GoogleCalendar;
using Alamida.Calendar.Core.Models;
using Alamida.Calendar.Profiles;
using FlaUI.UIA3;

namespace Alamida.Calendar.Watcher;

/// <summary>
/// Liest Detailmaske (Termine/Überführung) und Maske „Neuer Sterbefall“.
/// </summary>
public sealed class AlamidaMaskWatcher
{
    private readonly FieldMappingProfile _profile;
    private MaskKind _letzteMaske = MaskKind.Unbekannt;
    private bool _letztesAlamidaFensterGefunden;

    public AlamidaMaskWatcher(FieldMappingProfile profile) => _profile = profile;

    public MaskKind LetzteErkannteMaske => _letzteMaske;

    public bool LetztesAlamidaFensterGefunden => _letztesAlamidaFensterGefunden;

    /// <summary>Dauer der letzten Masken-Erfassung (Fenster + Element-Baum lesen).</summary>
    public long LetzteErfassungMs { get; private set; }

    public DetailSnapshot? TryCaptureSnapshot() => TryCaptureSnapshot(out _);

    public DetailSnapshot? TryCaptureSnapshot(out string? debugLog)
    {
        debugLog = null;
        using var automation = new UIA3Automation();
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var (window, elements) = AlamidaWindowHelper.FindBestWindow(automation, _profile.WindowTitlePatterns);
        _letztesAlamidaFensterGefunden = window != null;
        if (window == null)
        {
            _letzteMaske = MaskKind.Unbekannt;
            return null;
        }

        // Vorsorge zuerst: ihr Kopf „26426 | Name (2025)“ sieht aus wie ein Sterbefall-Kopf.
        var vorsorge = _profile.Vorsorge;
        if (vorsorge.Aktiv && elements.Any(el => vorsorge.DetectAutomationIdContains.Any(m =>
                el.AutomationId.Contains(m, StringComparison.OrdinalIgnoreCase))))
        {
            _letzteMaske = MaskKind.VorsorgeTermine;
            LetzteErfassungMs = sw.ElapsedMilliseconds;
            return VorsorgeSnapshot(window, elements, vorsorge, out debugLog);
        }

        var maske = MaskDetector.Detect(elements);
        if (maske == MaskKind.Unbekannt && MaskDetector.WindowHasOpenSterbefallHeader(elements))
            maske = MaskKind.DetailUeberfuehrung;

        _letzteMaske = maske;
        LetzteErfassungMs = sw.ElapsedMilliseconds;

        if (maske == MaskKind.NeuerSterbefall && _profile.NeuerSterbefall.Fields.Count > 0)
        {
            var fields = UiaFieldExtractor.ExtractFields(elements, _profile.NeuerSterbefall.Fields);
            TerminOrtFields.MergeOrtUndZusatz(fields);
            debugLog = FormatDebug(maske, fields);
            var maxZeilen = _profile.Detailmaske.Ueberfuehrung.MaxEtappen > 0
                ? _profile.Detailmaske.Ueberfuehrung.MaxEtappen
                : AlamidaEtappenFields.DefaultMaxEtappen;
            return NeuerSterbefallSnapshotBuilder.Build(fields, maxZeilen) with
            {
                VorhandeneTerminArten = LoeschSchutz.ArtenAusFeldern(UiaFieldExtractor.VorhandeneFelder(elements, _profile.NeuerSterbefall.Fields)),
            };
        }

        // Nur echte Termine/Überführungs-Maske — sonst keine Felder auslesen (verhindert Leer-Sync).
        if (maske == MaskKind.DetailUeberfuehrung)
        {
            var detailMask = _profile.Detailmaske.Ueberfuehrung;
            var fields = UiaFieldExtractor.ExtractFields(elements, detailMask.Fields);
            NormalizeTerminFelder(fields);
            TerminOrtFields.MergeOrtUndZusatz(fields);
            debugLog = FormatDebug(MaskKind.DetailUeberfuehrung, fields);

            var header = fields.GetValueOrDefault("sterbefallHeader");
            var (id, name) = AlamidaFieldParser.ParseSterbefallHeader(header);
            var maxZeilen = detailMask.MaxEtappen > 0
                ? detailMask.MaxEtappen
                : AlamidaEtappenFields.DefaultMaxEtappen;
            var rohdaten = AlamidaEtappenFields.CollectRohdaten(fields, maxZeilen);

            var snap = UeberfuehrungSnapshotBuilder.Build(
                fields.GetValueOrDefault("sterbefallId") ?? id,
                fields.GetValueOrDefault("verstorbenerName") ?? name,
                sterbeort: null,
                fields.GetValueOrDefault("bestattungsart"),
                fields.GetValueOrDefault("beisetzungsort"),
                fields.GetValueOrDefault("krematoriumOrt"),
                fields.GetValueOrDefault("feuerbestattungOrt"),
                fields.GetValueOrDefault("kuehlraum"),
                fields.GetValueOrDefault("kuehlplatz"),
                fields.GetValueOrDefault("beisetzungsdatum"),
                fields.GetValueOrDefault("beisetzungszeit"),
                fields.GetValueOrDefault("trauerfeierdatum"),
                fields.GetValueOrDefault("trauerfeierzeit"),
                fields.GetValueOrDefault("trauerfeierort"),
                fields.GetValueOrDefault("trauerfeier2datum"),
                fields.GetValueOrDefault("trauerfeier2zeit"),
                fields.GetValueOrDefault("trauerfeier2ort"),
                fields.GetValueOrDefault("rosenkranzdatum"),
                fields.GetValueOrDefault("rosenkranzzeit"),
                fields.GetValueOrDefault("rosenkranzort"),
                fields.GetValueOrDefault("aufnahmedatum"),
                fields.GetValueOrDefault("aufnahmezeit"),
                fields.GetValueOrDefault("aufnahmeort"),
                fields.GetValueOrDefault("imAnschluss"),
                rohdaten);

            return snap with
            {
                QuelleMaske = "detail_ueberfuehrung",
                ErfassungsPhase = "detail",
                IstNeuerFall = false,
                ErfassungSchluessel = snap.SterbefallId ?? snap.VerstorbenerName,
                VorhandeneTerminArten = LoeschSchutz.ArtenAusFeldern(UiaFieldExtractor.VorhandeneFelder(elements, detailMask.Fields)),
            };
        }

        return null;
    }

    private string? _letzterVorsorgeKopf;

    /// <summary>Letzte Vorsorge-Erkennung (Quelle, gelesene Kopfzeile, Ergebnis) für die Statusmeldung.</summary>
    public string? VorsorgeDiagnose { get; private set; }

    private DetailSnapshot? VorsorgeSnapshot(
        FlaUI.Core.AutomationElements.AutomationElement window, UiaElementInfo[] elements, VorsorgeMaskConfig cfg, out string? debugLog)
    {
        var kopfText = UiaFieldExtractor.ExtractFields(elements, new Dictionary<string, FieldLocator> { ["kopf"] = cfg.Kopf })
            .GetValueOrDefault("kopf");
        var kopf = VorsorgeKopf.Parse(kopfText);
        var quelle = "uia";
        if (kopf == null)
        {
            quelle = "ocr";
            try { kopfText = KopfzeilenOcr.LeseKopfleiste(window); }
            catch (Exception ex) { kopfText = "OCR-Fehler: " + ex.Message; }
            kopf = VorsorgeKopf.Parse(kopfText);
        }

        var termine = new List<VorsorgeTermin>();
        var vorhanden = new HashSet<string>(StringComparer.Ordinal);
        var debug = new List<string> { $"Maske={MaskKind.VorsorgeTermine}", $"kopf({quelle})={kopfText ?? "(leer)"}" };
        for (var n = 1; n <= Math.Max(1, cfg.MaxTermine); n++)
        {
            var locators = cfg.FelderFuer(n);
            var f = UiaFieldExtractor.ExtractFields(elements, locators);
            if (UiaFieldExtractor.VorhandeneFelder(elements, locators).Contains("datum")) vorhanden.Add($"vorsorge{n}");
            debug.AddRange(f.Select(kv => $"{n}.{kv.Key}={kv.Value ?? "(leer)"}"));
            termine.Add(new VorsorgeTermin
            {
                Nummer = n,
                Datum = f.GetValueOrDefault("datum"),
                Zeit = f.GetValueOrDefault("zeit"),
                Ort = f.GetValueOrDefault("ort"),
                Notiz = f.GetValueOrDefault("notiz"),
            });
        }
        debugLog = string.Join(Environment.NewLine, debug);

        // Texterkennung: erst übernehmen, wenn zwei Abfragen hintereinander dieselbe Nummer liefern.
        var schluessel = kopf == null ? null : $"{kopf.Value.Nummer}|{kopf.Value.Name}";
        var bestaetigt = schluessel != null && (quelle == "uia" || schluessel == _letzterVorsorgeKopf);
        _letzterVorsorgeKopf = schluessel;
        var gelesen = (kopfText ?? "(leer)").Replace('\n', ' ').Replace('\r', ' ');
        if (gelesen.Length > 120) gelesen = gelesen[..120];
        VorsorgeDiagnose = $"{DateTime.Now:dd.MM. HH:mm:ss} {quelle}: {gelesen} -> "
            + (bestaetigt ? $"V{kopf!.Value.Nummer}, {termine.Count(t => !string.IsNullOrWhiteSpace(t.Datum))} Termine"
                : schluessel == null ? "keine Vorsorgenummer erkannt" : "wartet auf Bestätigung");
        if (!bestaetigt) return null;

        return new DetailSnapshot
        {
            SterbefallId = "V" + kopf!.Value.Nummer,
            VerstorbenerName = kopf.Value.Name,
            QuelleMaske = "vorsorge_termine",
            ErfassungsPhase = "detail",
            VorsorgeTermine = termine,
            VorhandeneTerminArten = vorhanden,
        };
    }

    private static void NormalizeTerminFelder(Dictionary<string, string?> fields)
    {
        foreach (var key in fields.Keys.ToList())
        {
            if (key.EndsWith("datum", StringComparison.OrdinalIgnoreCase))
            {
                var raw = fields.GetValueOrDefault(key);
                fields[key] = AlamidaFieldNormalizer.NormalizeDatum(raw);
                if (string.IsNullOrWhiteSpace(fields[key])) continue;

                if (AlamidaFieldParser.TryParseDatumZeit(raw, null, out var dt, out var hatZeit) && hatZeit)
                {
                    var zeitKey = key[..^5] + "zeit";
                    var beisetzungImAnschluss = string.Equals(key, "beisetzungsdatum", StringComparison.OrdinalIgnoreCase)
                        && (SterbefallHistorieResolver.IstImAnschluss(fields.GetValueOrDefault("beisetzungszeit"))
                            || SterbefallHistorieResolver.IstImAnschluss(fields.GetValueOrDefault("imAnschluss")));
                    if (!beisetzungImAnschluss
                        && fields.ContainsKey(zeitKey)
                        && string.IsNullOrWhiteSpace(fields.GetValueOrDefault(zeitKey)))
                    {
                        fields[zeitKey] = dt.ToString("HH:mm", System.Globalization.CultureInfo.InvariantCulture);
                    }
                }
            }
            else if (key.EndsWith("zeit", StringComparison.OrdinalIgnoreCase))
            {
                fields[key] = AlamidaFieldNormalizer.NormalizeZeit(fields.GetValueOrDefault(key));
            }
        }

        if (SterbefallHistorieResolver.IstImAnschluss(fields.GetValueOrDefault("beisetzungszeit")))
            fields["imAnschluss"] = "ja";

        CoalesceImAnschlussBeisetzung(fields);
        SanitizeImAnschlussBeisetzung(fields);
    }

    /// <summary>Beisetzung „Im Anschluss“: kein erfundenes Uhrzeit-Feld aus Datum/Sync.</summary>
    private static void SanitizeImAnschlussBeisetzung(Dictionary<string, string?> fields)
    {
        var imAnschluss = SterbefallHistorieResolver.IstImAnschluss(fields.GetValueOrDefault("imAnschluss"))
            || SterbefallHistorieResolver.IstImAnschluss(fields.GetValueOrDefault("beisetzungszeit"));
        if (!imAnschluss) return;

        fields["imAnschluss"] = "ja";
        fields["beisetzungszeit"] = null;
        if (!string.IsNullOrWhiteSpace(fields.GetValueOrDefault("beisetzungsdatum")))
            fields["beisetzungsdatum"] = AlamidaFieldNormalizer.NormalizeDatum(fields["beisetzungsdatum"]);
    }

    private static void CoalesceImAnschlussBeisetzung(Dictionary<string, string?> fields)
    {
        var imAnschluss = SterbefallHistorieResolver.IstImAnschluss(fields.GetValueOrDefault("imAnschluss"))
            || SterbefallHistorieResolver.IstImAnschluss(fields.GetValueOrDefault("beisetzungszeit"));
        if (!imAnschluss) return;

        if (!string.IsNullOrWhiteSpace(fields.GetValueOrDefault("beisetzungsdatum"))) return;
        var tf = fields.GetValueOrDefault("trauerfeierdatum");
        if (string.IsNullOrWhiteSpace(tf)) return;
        fields["beisetzungsdatum"] = tf;
    }

    private static string FormatDebug(MaskKind maske, Dictionary<string, string?> fields) =>
        $"Maske={maske}" + Environment.NewLine +
        string.Join(Environment.NewLine, fields.Select(kv => $"{kv.Key}={(kv.Value ?? "(leer)")}"));
}
