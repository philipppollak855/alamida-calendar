using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Alamida.Calendar.Core.Models;

namespace Alamida.Calendar.Agent;

/// <summary>Holt Kalender, Dauer und Aktiv je Kategorie aus der Web-App und meldet den Agent-Status dorthin.
/// Anmeldung per JWT, signiert mit dem Service-Account-Schlüssel (die Web-App hat denselben).</summary>
public sealed class ZentraleEinstellungen
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private readonly AgentConfig _config;
    private readonly Dictionary<EventCategory, KategorieSettings> _lokal;
    private readonly string _lokalerKalender;
    private readonly string _cachePfad;
    private readonly string _email = "";
    private readonly RSA? _rsa;

    public DateTime? ZuletztGeladen { get; private set; }
    public string? LetzterFehler { get; private set; }
    private bool Bereit => _rsa != null && !string.IsNullOrWhiteSpace(_config.WebUrl);

    public ZentraleEinstellungen(AgentConfig config, string cachePfad)
    {
        _config = config;
        _cachePfad = cachePfad;
        _lokal = config.Kategorien.ToDictionary(kv => kv.Key, kv => ZentraleKonfiguration.Kopie(kv.Value));
        _lokalerKalender = config.CalendarId;
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(Environment.ExpandEnvironmentVariables(config.ServiceAccountPath)));
            _email = doc.RootElement.GetProperty("client_email").GetString() ?? "";
            var rsa = RSA.Create();
            rsa.ImportFromPem(doc.RootElement.GetProperty("private_key").GetString());
            _rsa = rsa;
        }
        catch (Exception ex)
        {
            LetzterFehler = "Service-Account-Schlüssel: " + ex.Message;
        }
        try
        {
            if (File.Exists(cachePfad)) Anwenden(File.ReadAllText(cachePfad));
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Zentrale Einstellungen (Cache) nicht gelesen: {ex.Message}");
        }
    }

    private void Anwenden(string json) => ZentraleKonfiguration.Anwenden(json, _config, _lokal, _lokalerKalender);

    private string Token()
    {
        static string B64(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var jetzt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var kopf = B64(Encoding.UTF8.GetBytes("{\"alg\":\"RS256\",\"typ\":\"JWT\"}"));
        var inhalt = B64(JsonSerializer.SerializeToUtf8Bytes(new { iss = _email, aud = "alamida-agent", iat = jetzt, exp = jetzt + 300 }));
        var signatur = _rsa!.SignData(Encoding.ASCII.GetBytes($"{kopf}.{inhalt}"), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        return $"{kopf}.{inhalt}.{B64(signatur)}";
    }

    private HttpRequestMessage Anfrage(HttpMethod methode)
    {
        var req = new HttpRequestMessage(methode, _config.WebUrl.TrimEnd('/') + "/api/agent");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Token());
        return req;
    }

    public async Task<bool> LadenAsync()
    {
        if (!Bereit) return false;
        try
        {
            using var req = Anfrage(HttpMethod.Get);
            using var res = await Http.SendAsync(req);
            var text = await res.Content.ReadAsStringAsync();
            if (!res.IsSuccessStatusCode)
            {
                LetzterFehler = $"Web-App antwortet {(int)res.StatusCode}";
                return false;
            }
            Anwenden(text);
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_cachePfad)!);
                File.WriteAllText(_cachePfad, text);
            }
            catch { /* Cache ist optional */ }
            ZuletztGeladen = DateTime.Now;
            LetzterFehler = null;
            return true;
        }
        catch (Exception ex)
        {
            LetzterFehler = "Web-App nicht erreichbar: " + ex.Message;
            return false;
        }
    }

    public async Task StatusSendenAsync(object status)
    {
        if (!Bereit) return;
        try
        {
            using var req = Anfrage(HttpMethod.Post);
            req.Content = JsonContent.Create(status);
            using var res = await Http.SendAsync(req);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Status nicht gesendet: {ex.Message}");
        }
    }
}
