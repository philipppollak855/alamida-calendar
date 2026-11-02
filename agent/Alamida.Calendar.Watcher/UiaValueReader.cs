using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;

namespace Alamida.Calendar.Watcher;

internal static class UiaValueReader
{
    public static string? Read(AutomationElement element)
    {
        try
        {
            if (element.Patterns.Toggle.IsSupported)
            {
                var state = element.Patterns.Toggle.Pattern.ToggleState.Value;
                return state == ToggleState.On ? "1" : "0";
            }
        }
        catch { /* ignore */ }

        try
        {
            if (element.Patterns.Value.IsSupported)
            {
                var v = element.Patterns.Value.Pattern.Value.Value;
                if (!string.IsNullOrWhiteSpace(v))
                    return v.Trim();
            }
        }
        catch { /* ignore */ }

        try
        {
            var text = element.AsTextBox()?.Text;
            if (!string.IsNullOrWhiteSpace(text))
                return text.Trim();
        }
        catch { /* ignore */ }

        try
        {
            var name = element.Name;
            if (!string.IsNullOrWhiteSpace(name))
            {
                var aid = SafeGet(() => element.AutomationId) ?? "";
                if (aid.Contains("Check Box Set", StringComparison.OrdinalIgnoreCase))
                {
                    var m = System.Text.RegularExpressions.Regex.Match(
                        name, @"Markierungsfeldset\s+(\d+)\s+geprüft", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                    if (m.Success)
                        return m.Groups[1].Value == "1" ? "1" : "0";
                }
                return name.Trim();
            }
        }
        catch { /* ignore */ }

        return null;
    }

    public static T? SafeGet<T>(Func<T> getter)
    {
        try { return getter(); }
        catch { return default; }
    }
}
