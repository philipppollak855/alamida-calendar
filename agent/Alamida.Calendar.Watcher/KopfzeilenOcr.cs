using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using FlaUI.Core.AutomationElements;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;

namespace Alamida.Calendar.Watcher;

/// <summary>
/// Liest die oberste Leiste des Alamida-Fensters per Windows-Texterkennung.
/// Die Vorsorge-Kopfzeile („26424 | Name …“) ist nicht über UI Automation lesbar.
/// </summary>
internal static class KopfzeilenOcr
{
    [DllImport("user32.dll")] private static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out Rect r);
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int L, T, R, B; }

    private static OcrEngine? _engine;

    public static string? LeseKopfleiste(AutomationElement window)
    {
        var hwnd = window.Properties.NativeWindowHandle.ValueOrDefault;
        if (hwnd == IntPtr.Zero || !GetWindowRect(hwnd, out var wr)) return null;
        int breite = wr.R - wr.L, hoehe = wr.B - wr.T;
        if (breite <= 0 || hoehe <= 0) return null;

        _engine ??= OcrEngine.TryCreateFromLanguage(new Windows.Globalization.Language("de-DE"))
                    ?? OcrEngine.TryCreateFromUserProfileLanguages();
        if (_engine == null) return null;

        var content = window.FindFirstDescendant(c => c.ByAutomationId("View: 1"))?.BoundingRectangle;
        var c0 = content is { Width: > 0, Height: > 0 } ? content.Value : new Rectangle(wr.L, wr.T, breite, hoehe);
        var streifen = new Rectangle(c0.Left - wr.L, c0.Top - wr.T, c0.Width, Math.Clamp(c0.Height / 30, 30, 90));
        streifen.Intersect(new Rectangle(0, 0, breite, hoehe));
        if (streifen.Width <= 0 || streifen.Height <= 0) return null;

        using var bmp = new Bitmap(breite, hoehe);
        using (var g = Graphics.FromImage(bmp))
        {
            var hdc = g.GetHdc();
            try { if (!PrintWindow(hwnd, hdc, 2)) return null; }
            finally { g.ReleaseHdc(hdc); }
        }

        const int faktor = 3;
        using var gross = new Bitmap(streifen.Width * faktor, streifen.Height * faktor);
        using (var g = Graphics.FromImage(gross))
        {
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.DrawImage(bmp, new Rectangle(0, 0, gross.Width, gross.Height), streifen, GraphicsUnit.Pixel);
        }

        using var ms = new MemoryStream();
        gross.Save(ms, ImageFormat.Png);
        ms.Position = 0;
        return Erkenne(_engine, ms).GetAwaiter().GetResult();
    }

    private static async Task<string> Erkenne(OcrEngine engine, MemoryStream png)
    {
        var decoder = await BitmapDecoder.CreateAsync(png.AsRandomAccessStream());
        using var sb = await decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied);
        var res = await engine.RecognizeAsync(sb);
        return string.Join(" / ", res.Lines.Select(l => l.Text));
    }
}
