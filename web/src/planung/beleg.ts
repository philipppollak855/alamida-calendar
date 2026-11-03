/** Fotos vor dem Hochladen verkleinern (Handykamera-Bilder sind oft > 4 MB). PDFs und HEIC bleiben unverändert. */
export async function belegVorbereiten(f: File): Promise<{ datei: Blob; name: string }> {
  const name = f.name || 'Bestaetigung';
  if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < 1_200_000) return { datei: f, name };
  try {
    const bild = await createImageBitmap(f);
    const s = Math.min(1, 2200 / Math.max(bild.width, bild.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bild.width * s);
    c.height = Math.round(bild.height * s);
    c.getContext('2d')!.drawImage(bild, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.85));
    return blob && blob.size < f.size ? { datei: blob, name: name.replace(/\.[^.]+$/, '') + '.jpg' } : { datei: f, name };
  } catch {
    return { datei: f, name };
  }
}

const spaeterFreigeben = (url: string) => setTimeout(() => URL.revokeObjectURL(url), 60_000);

export function herunterladen(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  spaeterFreigeben(url);
}

/** Druckt PDF oder Bild über einen unsichtbaren Rahmen. */
export function drucken(blob: Blob, typ: string) {
  const url = URL.createObjectURL(blob);
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  if (typ === 'application/pdf') f.src = url;
  else f.srcdoc = `<!doctype html><html><body style="margin:0"><img src="${url}" style="max-width:100%;max-height:100vh;display:block;margin:auto"></body></html>`;
  f.onload = () => {
    const druck = () => {
      try {
        f.contentWindow?.focus();
        f.contentWindow?.print();
      } catch {
        window.open(url, '_blank');
      }
    };
    if (typ === 'application/pdf') setTimeout(druck, 300);
    else {
      const img = f.contentDocument?.querySelector('img');
      if (img && !img.complete) img.onload = druck;
      else druck();
    }
    setTimeout(() => f.remove(), 60_000);
  };
  document.body.appendChild(f);
  spaeterFreigeben(url);
}
