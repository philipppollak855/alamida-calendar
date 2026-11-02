using Alamida.Calendar.Core.Models;

namespace Alamida.Calendar.Watcher;

public sealed class SterbefallTracker
{
    private string? _aktiverSchluessel;

    public static string? Schluessel(DetailSnapshot snapshot)
    {
        if (!string.IsNullOrWhiteSpace(snapshot.SterbefallId))
            return snapshot.SterbefallId.Trim();
        if (!string.IsNullOrWhiteSpace(snapshot.ErfassungSchluessel))
            return snapshot.ErfassungSchluessel.Trim();
        if (!string.IsNullOrWhiteSpace(snapshot.VerstorbenerName))
            return snapshot.VerstorbenerName.Trim();
        var kombi = $"{snapshot.VerstorbenerVorname}|{snapshot.VerstorbenerNachname}".Trim('|');
        return string.IsNullOrWhiteSpace(kombi) ? null : kombi;
    }

    public (bool Wechsel, string? VorherigerSchluessel) Register(DetailSnapshot snapshot)
    {
        var key = Schluessel(snapshot);
        if (string.IsNullOrEmpty(key))
            return (false, _aktiverSchluessel);

        var vorher = _aktiverSchluessel;
        if (vorher == key)
            return (false, vorher);

        _aktiverSchluessel = key;
        return (true, vorher);
    }

    public void Clear() => _aktiverSchluessel = null;
}
