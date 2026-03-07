// ai.js (version corrigée complète)

const fs = require("fs");
const path = require("path");
const Tesseract = require("tesseract.js");
const pdfParse = require("pdf-parse");

// OCR PDF scanné (convert pages -> images) (optionnel)
let pdf2pic = null;
try {
  pdf2pic = require("pdf2pic");
} catch (_) {
  // pas installé => OCR PDF scanné désactivé
}

// ===== Appel Ollama local =====
async function askOllama(prompt) {
  // ✅ URL normale (pas en markdown)
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3.2:1b",
      prompt,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama error: ${res.status} ${text}`);
  }

  const data = await res.json().catch(() => ({}));
  return (data.response || "").trim();
}

// ===== OCR IMAGE =====
async function extractTextFromImage(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return "";
    const { data } = await Tesseract.recognize(filePath, "fra");
    return (data?.text || "").trim();
  } catch (err) {
    console.log("Erreur OCR image:", err.message);
    return "";
  }
}

// ===== Extraction PDF (texte + fallback OCR si scanné) =====
async function extractTextFromPdf(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return "";

    // 1) Essaye extraction texte classique (PDF “normal”)
    const buffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(buffer);
    const text = (parsed?.text || "").trim();

    // Si le PDF contient déjà du texte -> parfait
    if (text && text.length >= 30) return text;

    // 2) Sinon, fallback OCR (PDF scanné) si pdf2pic dispo
    if (!pdf2pic) return "";

    // Convertit 1-2 pages max pour éviter lenteur
    const tmpDir = path.join(__dirname, "tmp_ocr");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    // ✅ pdf2pic: selon la version, fromPath peut être nommé "fromPath"
    // On supporte les 2 cas au cas où
    const fromPath = pdf2pic.fromPath || pdf2pic;
    const converter = fromPath(filePath, {
      density: 200,
      saveFilename: `page_${Date.now()}`,
      savePath: tmpDir,
      format: "png",
      width: 1600,
    });

    const pagesToTry = [1, 2];
    let ocrText = "";

    for (const page of pagesToTry) {
      try {
        const out = await converter(page);
        const imgPath = out?.path;
        if (imgPath && fs.existsSync(imgPath)) {
          const t = await extractTextFromImage(imgPath);
          if (t) ocrText += `\n\n--- OCR PDF PAGE ${page} ---\n${t}`;
        }
      } catch (e) {
        console.log("OCR PDF page error:", e.message);
      }
    }

    return ocrText.trim();
  } catch (err) {
    console.log("Erreur extraction PDF:", err.message);
    return "";
  }
}

// ===== Construction du prompt IA =====
function buildPrompt({ patient, analyse, extractedText }) {
  return `
Tu es un assistant pour médecin.
⚠️ Interdictions :
- Pas de diagnostic
- Pas de prescription
- Pas de recommandation médicale

Objectif :
Résumer et attirer l'attention sur des éléments potentiellement importants à vérifier.

Répond STRICTEMENT en JSON valide (pas de texte avant/après).

Patient :
- Nom: ${patient.nom ?? ""} ${patient.prenom ?? ""}
- Age: ${patient.age ?? "inconnu"}
- Sexe: ${patient.sexe ?? "inconnu"}

Analyse :
- Type: ${analyse.nom ?? "inconnu"}
- Date: ${analyse.date_analyse ?? "inconnue"}
- Lien consultation: ${analyse.consultation_id ?? "non"}

Texte :
${extractedText || "VIDE"}

Format JSON EXACT :
{
  "resume": "...",
  "points_attention": ["..."],
  "valeurs_extraites": [
    { "nom":"", "valeur":"", "unite":"", "statut":"bas|normal|haut|inconnu" }
  ],
  "questions_pour_medecin": ["..."],
  "niveau_confiance": "faible|moyen|bon"
}
`.trim();
}

module.exports = {
  askOllama,
  extractTextFromPdf,
  extractTextFromImage,
  buildPrompt,
};