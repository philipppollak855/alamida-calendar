using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.UIA3;

namespace Alamida.Calendar.Watcher;

public static class AlamidaWindowHelper
{
    public static AutomationElement? FindBestWindow(
        UIA3Automation automation,
        IReadOnlyList<string> titlePatterns)
    {
        var desktop = automation.GetDesktop();
        var windows = desktop.FindAllChildren(cf => cf.ByControlType(ControlType.Window));

        AutomationElement? best = null;
        var bestScore = -1;

        foreach (var window in windows)
        {
            var title = window.Name ?? "";
            if (!titlePatterns.Any(p => title.Contains(p, StringComparison.OrdinalIgnoreCase)))
                continue;

            var score = ScoreWindow(window);
            if (score > bestScore)
            {
                bestScore = score;
                best = window;
            }
        }

        return best;
    }

    public static int ScoreWindow(AutomationElement window)
    {
        var score = 0;
        try
        {
            var r = window.BoundingRectangle;
            score += (int)(r.Width * r.Height / 10_000);
        }
        catch { /* ignore */ }

        foreach (var el in window.FindAllDescendants())
        {
            var aid = UiaValueReader.SafeGet(() => el.AutomationId) ?? "";
            var name = UiaValueReader.SafeGet(() => el.Name) ?? "";
            var value = UiaValueReader.Read(el);

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
