using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.UIA3;

namespace Alamida.Calendar.Watcher;

public static class AlamidaWindowHelper
{
    /// <summary>Bestes Alamida-Fenster samt einmal gelesenem Element-Baum.</summary>
    public static (AutomationElement? Window, UiaElementInfo[] Elements) FindBestWindow(
        UIA3Automation automation,
        IReadOnlyList<string> titlePatterns)
    {
        var desktop = automation.GetDesktop();
        var windows = desktop.FindAllChildren(cf => cf.ByControlType(ControlType.Window))
            .Where(w =>
            {
                var title = UiaValueReader.SafeGet(() => w.Name) ?? "";
                return titlePatterns.Any(p => title.Contains(p, StringComparison.OrdinalIgnoreCase));
            })
            .ToList();

        AutomationElement? best = null;
        UiaElementInfo[] bestElements = [];
        var bestScore = -1;

        foreach (var window in windows)
        {
            var elements = UiaElementInfo.ReadTree(window);
            if (windows.Count == 1)
                return (window, elements);

            var score = ScoreWindow(window, elements);
            if (score > bestScore)
            {
                bestScore = score;
                best = window;
                bestElements = elements;
            }
        }

        return (best, bestElements);
    }

    public static int ScoreWindow(AutomationElement window, IReadOnlyList<UiaElementInfo> elements)
    {
        var score = 0;
        try
        {
            var r = window.BoundingRectangle;
            score += (int)(r.Width * r.Height / 10_000);
        }
        catch { /* ignore */ }

        foreach (var el in elements)
        {
            var aid = el.AutomationId;
            var name = el.Name;
            var value = el.Value;

            if (aid.Contains("Termin_Überführung1_Text", StringComparison.OrdinalIgnoreCase)
                || aid.Contains("Field: sfl 2::Termin_Überführung1_Text", StringComparison.OrdinalIgnoreCase))
                score += 1000;
            else if (aid.Contains("Field: sfl 2::Termin_", StringComparison.OrdinalIgnoreCase))
                score += 400;

            if (MaskDetector.LooksLikeOpenSterbefallHeader(name) ||
                MaskDetector.LooksLikeOpenSterbefallHeader(value))
                score += 500;

            if (name.Contains("Neuer Sterbefall", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("Neuer Sterbefalls", StringComparison.OrdinalIgnoreCase))
                score += 1200;

            foreach (var marker in MaskDetector.NeuerSterbefallAutomationMarkers)
            {
                if (aid.Contains(marker, StringComparison.OrdinalIgnoreCase))
                    score += 800;
            }
        }

        return score;
    }
}
