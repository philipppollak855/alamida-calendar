using System.Text;
using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.UIA3;

namespace Alamida.Calendar.Watcher;

public static class UiInspector
{
    public static string DumpAllWindows(IEnumerable<string> titlePatterns)
    {
        var sb = new StringBuilder();
        using var automation = new UIA3Automation();

        foreach (var window in GetTopLevelWindows(automation))
        {
            var title = window.Name ?? "";
            if (!titlePatterns.Any(p => title.Contains(p, StringComparison.OrdinalIgnoreCase)))
                continue;

            sb.AppendLine($"=== WINDOW: {title} ===");
            DumpElement(window, sb, 0, maxDepth: 12);
            sb.AppendLine();
        }

        if (sb.Length == 0)
        {
            sb.AppendLine("Kein Fenster mit passendem Titel (Alamida/FileMaker).");
            sb.AppendLine("Offene Fenster:");
            foreach (var window in GetTopLevelWindows(automation))
            {
                var title = window.Name ?? "(ohne Titel)";
                if (!string.IsNullOrWhiteSpace(title))
                    sb.AppendLine($"  - {title}");
            }
        }

        return sb.ToString();
    }

    private static IEnumerable<AutomationElement> GetTopLevelWindows(UIA3Automation automation)
    {
        var desktop = automation.GetDesktop();
        return desktop.FindAllChildren(cf => cf.ByControlType(ControlType.Window));
    }

    private static void DumpElement(AutomationElement element, StringBuilder sb, int depth, int maxDepth)
    {
        if (depth > maxDepth) return;

        var indent = new string(' ', depth * 2);
        var name = SafeGet(() => element.Name) ?? "";
        var aid = SafeGet(() => element.AutomationId) ?? "";
        var ct = SafeGet(() => element.ControlType.ToString()) ?? "?";
        var value = UiaValueReader.Read(element) ?? "";

        sb.AppendLine($"{indent}[{ct}] Name=\"{name}\" AutomationId=\"{aid}\" Value=\"{value}\"");

        foreach (var child in element.FindAllChildren())
            DumpElement(child, sb, depth + 1, maxDepth);
    }

    private static T? SafeGet<T>(Func<T> getter)
    {
        try { return getter(); }
        catch { return default; }
    }

}
