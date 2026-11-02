using FlaUI.Core.AutomationElements;

namespace Alamida.Calendar.Watcher;

/// <summary>Einmal pro Abfrage gelesene UIA-Eigenschaften (jeder Zugriff auf ein Live-Element ist ein langsamer Prozessaufruf).</summary>
public sealed record UiaElementInfo(string AutomationId, string Name, string ControlType, string? Value)
{
    public static UiaElementInfo[] ReadTree(AutomationElement root)
    {
        var elements = UiaValueReader.SafeGet(() => root.FindAllDescendants()) ?? [];
        var result = new UiaElementInfo[elements.Length];
        for (var i = 0; i < elements.Length; i++)
        {
            var el = elements[i];
            result[i] = new UiaElementInfo(
                UiaValueReader.SafeGet(() => el.AutomationId) ?? "",
                UiaValueReader.SafeGet(() => el.Name) ?? "",
                UiaValueReader.SafeGet(() => el.ControlType.ToString()) ?? "",
                UiaValueReader.Read(el));
        }
        return result;
    }
}
