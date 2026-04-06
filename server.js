// server.js — MATI SANTE PRO (FULL) ✅
// - Patients / Allergies / Antécédents / Consultations
// - Analyses (upload + list + delete)
// - Imagerie (upload + list + delete)
// - Ordonnances (upload + list + delete)
// - Documents (upload + list + delete)
// - Parametres (cabinet)
// ✅ Anti-casse: colonnes dynamiques via information_schema
// ✅ /uploads exposé
// ✅ RDV + Anti-double + Stats + SMS (simulé par défaut)

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const puppeteer = require("puppeteer");
const bcrypt = require("bcrypt");
const cloudinary = require("cloudinary").v2;
const medecinOrAdmin = requireRole("medecin", "admin");
const staff = requireRole("secretaire", "medecin", "admin");

// ✅ IMPORTANT : import correct
const cloudinaryStorage = require("multer-storage-cloudinary");

// ✅ config cloudinary AVANT utilisation
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ stockage corrigé (PAS de new)
const storageCloudinary = cloudinaryStorage({
  cloudinary: cloudinary,
  folder: "mati-sante",
  allowedFormats: ["jpg", "png", "jpeg", "pdf"],
});

console.log(
  "Cloudinary config ok:",
  !!process.env.CLOUDINARY_CLOUD_NAME,
  !!process.env.CLOUDINARY_API_KEY,
  !!process.env.CLOUDINARY_API_SECRET
);

cloudinary.api.ping((error, result) => {
  if (error) {
    console.error("❌ Cloudinary ERROR:", error);
  } else {
    console.log("✅ Cloudinary connecté !");
  }
});

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}
function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function generateOrdonnancePdfAndUpload({
  titre,
  contenu,
  patient_id,
  cabinet_id,
}) {
  const safeTitre = titre || "Ordonnance";
  const safeContenu = contenu || "";
  const now = new Date();
  const dateStr = now.toLocaleDateString("fr-FR");

const barcodeRaw = `RX-${patient_id}-${Date.now()}`;
const cab = await pool.query(
  "SELECT * FROM parametres LIMIT 1"
);

const cabinetNom = cab.rows[0]?.nom || cab.rows[0]?.cabinet_nom || "";
const medecinNom = cab.rows[0]?.medecin || cab.rows[0]?.nom_medecin || "";
console.log("CABINET BACK =", cabinetNom);
console.log("MEDECIN BACK =", medecinNom);
const patientRes = await pool.query(
  "SELECT nom, prenom, date_naissance FROM patients WHERE id = $1 LIMIT 1",
  [patient_id]
);

const patientData = patientRes.rows[0] || {};
console.log("PDF PATIENT =", patientData);

const patientNomComplet =
  `${patientData.nom || ""} ${patientData.prenom || ""}`.trim() || String(patient_id);

const age =
  patientData.date_naissance
    ? new Date().getFullYear() - new Date(patientData.date_naissance).getFullYear()
    : "";
  console.log("PDF PATIENT =", { patient_id, patientData, patientNomComplet });

const cabinet = cab.rows[0] || {};
console.log("CABINET FULL =", cabinet);

const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>ORDONNANCE</title>
    <style>
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
      }
      body {
        font-family: Arial, sans-serif;
        color: #111827;
        padding: 28px;
      }
      .topAccent {
        width: 100%;
        height: 6px;
        border-radius: 999px;
        background: linear-gradient(90deg, #0f766e 0%, #14b8a6 45%, #99f6e4 100%);
        margin-bottom: 18px;
      }
      .headerRow {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: flex-start;
        margin-bottom: 14px;
      }
      .cabLeft {
        width: 42%;
        font-size: 13px;
        line-height: 1.45;
        text-align: left;
      }
      .cabName {
        font-size: 20px;
        font-weight: 800;
        color: #0f172a;
        margin-bottom: 5px;
      }
      .cabDoctor {
        margin-top: 4px;
        font-size: 15px;
        font-weight: 700;
        color: #111827;
      }
      .cabLine {
        color: #334155;
      }
      .docRight {
        flex: 1;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .docTitle {
        font-size: 44px;
        font-weight: 900;
        letter-spacing: 3px;
        color: #0f172a;
        margin-bottom: 6px;
        text-transform: uppercase;
        line-height: 1;
        border-bottom: 3px solid #0f766e;
        padding-bottom: 6px;
        display: inline-block;
      }
      .barcodeTopWrap {
        display: flex;
        justify-content: center;
        align-items: center;
        background: #ffffff;
        padding: 8px 10px;
        border-radius: 12px;
        margin: 8px 0 10px;
        min-height: 110px;
      }
      .barcodeTopWrap svg {
        max-width: 100%;
        height: auto;
      }
      .docDate {
        font-size: 12px;
        color: #475569;
        margin-top: 2px;
      }
      .headerSeparator {
        width: 100%;
        border-top: 2px solid #1f2937;
        margin: 10px 0 16px;
      }
      .patientBox {
        border: 1px solid #dbe2ea;
        background: #f8fafc;
        padding: 12px 14px;
        border-radius: 12px;
        margin: 14px 0 18px;
      }
      .patientRow {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        align-items: center;
      }
      .patientItem {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .label {
        font-size: 12px;
        font-weight: 700;
        color: #64748b;
        text-transform: uppercase;
      }
      .value {
        font-size: 15px;
        font-weight: 700;
        color: #0f172a;
      }
      .rxBody {
        min-height: 380px;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        background: #ffffff;
        padding: 20px 20px 26px;
      }
      .rxHead {
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .8px;
        color: #0f766e;
        margin-bottom: 14px;
      }
      .content {
        white-space: normal;
        line-height: 2;
        font-size: 16px;
        color: #111827;
      }
      .footerRow {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 20px;
        margin-top: 28px;
      }
      .footerLeft {
        flex: 1;
        align-self: flex-end;
        padding-bottom: 4px;
      }
      .miniLabel {
        font-size: 11px;
        color: #64748b;
        text-transform: uppercase;
        margin-bottom: 6px;
        letter-spacing: .4px;
      }
      .refText {
        font-size: 13px;
        font-weight: 700;
        color: #0f172a;
      }
      .signBox {
        width: 280px;
        text-align: center;
        background: #ffffff;
        padding: 10px 8px 0;
        border-top: 1px dashed #cbd5e1;
      }
      .signTitle {
        font-size: 13px;
        font-weight: 800;
        color: #334155;
        margin-bottom: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .signVisuals {
        min-height: 120px;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 12px;
        margin-bottom: 8px;
        position: relative;
      }
      .signaturePlaceholder {
        width: 150px;
        height: 70px;
      }
      .signDoctorName {
        font-size: 12px;
        color: #475569;
        margin-bottom: 10px;
        min-height: 16px;
      }
      .signLine {
        width: 100%;
        border-top: 2px solid #0f172a;
        margin-top: 4px;
      }
      @page {
        size: A4;
        margin: 14mm;
      }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  </head>
  <body>
    <div class="topAccent"></div>

    <div class="headerRow">
      <div class="cabLeft">
 <div class="cabName">${cabinet.cabinet_nom || ""}</div>
<div class="cabDoctor">
  ${cabinet.medecin_nom ? "Dr " + cabinet.medecin_nom : ""}
</div>
  <div class="cabLine">${cabinet.specialite || ""}</div>
  <div class="cabLine">${cabinet.adresse || ""}</div>
  <div class="cabLine">Tél: ${cabinet.telephone || ""}</div>
  <div class="cabLine">${cabinet.email || ""}</div>
</div>

      <div class="docRight">
        <div class="docTitle">ORDONNANCE</div>
        <div class="barcodeTopWrap">
          <svg id="rxBarcode"></svg>
        </div>
        <div class="docDate">${escapeHtml(dateStr)}</div>
      </div>
    </div>

    <div class="headerSeparator"></div>

    <div class="patientBox">
  <div class="patientRow">
    <div class="patientItem">
      <span class="label">Patient</span>
      <span class="value">
        ${escapeHtml(patientNomComplet)}
      </span>
    </div>
    <div class="patientItem">
  <span class="label">Âge</span>
  <span class="value">${escapeHtml(String(age))} ans</span>
</div>
  </div>
</div>

    <div class="rxBody">
      <div class="rxHead">Prescription</div>
      <div class="content">
        ${escapeHtml(safeContenu).replace(/\n/g, "<br>")}
      </div>
    </div>

    <div class="footerRow">
      <div class="footerLeft">
        <div class="miniLabel">Référence</div>
        <div class="refText">${escapeHtml(barcodeRaw)}</div>
      </div>

      <div class="signBox">
        <div class="signTitle">Signature et cachet</div>
        <div class="signVisuals">
          <div class="signaturePlaceholder"></div>
        </div>
        <div class="signDoctorName">
  ${cabinet.medecin_nom || cabinet.nom_medecin || cabinet.medecin
    ? "Dr " + (cabinet.medecin_nom || cabinet.nom_medecin || cabinet.medecin)
    : "Médecin traitant"}
</div>
        <div class="signLine"></div>
      </div>
    </div>

    <script>
      (function () {
        try {
          if (window.JsBarcode) {
            JsBarcode("#rxBarcode", "${barcodeRaw}", {
              format: "CODE128",
              width: 3,
              height: 90,
              displayValue: true,
              font: "Arial",
              fontSize: 18,
              margin: 8,
              background: "#ffffff",
              lineColor: "#09051a"
            });
          }
        } catch (e) {
          console.error("Erreur barcode:", e);
        }
      })();
    </script>
  </body>
</html>
`;

  const browser = await puppeteer.launch({
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    const tempDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempPdfPath = path.join(
      tempDir,
      `ordonnance_${patient_id}_${Date.now()}.pdf`
    );

    await page.pdf({
      path: tempPdfPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "12mm",
        bottom: "20mm",
        left: "12mm",
      },
    });

    const uploaded = await cloudinary.uploader.upload(tempPdfPath, {
      folder: "mati-sante",
      resource_type: "auto",
      public_id: `TESTPDF_${patient_id}_${Date.now()}`,

      overwrite: true,
    });

    if (fs.existsSync(tempPdfPath)) {
      fs.unlinkSync(tempPdfPath);
    }

    return uploaded.secure_url;
  } finally {
    await browser.close();
  }
}

const app = express();

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const patientStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const patientUpload = multer({
  storage: patientStorage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

console.log("✅ SERVER.JS VERSION:", new Date().toISOString());


// ---------------------------------------------------------
// Optional DB columns (compat)
// ---------------------------------------------------------
let _smsFlagChecked = false;
let _hasSmsConfirmFlag = false;
async function hasSmsConfirmFlagColumn() {
  if (_smsFlagChecked) return _hasSmsConfirmFlag;
  _smsFlagChecked = true;
  try {
    const r = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='rendez_vous'
         AND column_name='sms_confirm_envoye'
       LIMIT 1`
    );
    _hasSmsConfirmFlag = r.rowCount > 0;
  } catch (_) {
    _hasSmsConfirmFlag = false;
  }
  return _hasSmsConfirmFlag;
}

/* =============================
   TWILIO (SMS) - SAFE
   Par défaut: SMS simulé (console)
   Pour activer Twilio: SMS_MODE=twilio
============================= */
let twilioClient = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) return null;

  try {
    twilioClient = require("twilio")(sid, token);
    return twilioClient;
  } catch (e) {
    console.log("❌ Twilio init error:", e?.message || e);
    return null;
  }
}

function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).trim();
  p = p.replace(/[()\s-]/g, "");
  // si l’utilisateur met 06..., tu peux gérer ici si tu veux
  return p;
}

async function sendSms(to, body) {
  const mode = (process.env.SMS_MODE || "simulate").toLowerCase();

  const toNorm = normalizePhone(to);
  if (!toNorm) {
    console.log("⚠️ Pas de numéro pour SMS");
    return;
  }

  // ✅ Mode simulé (par défaut)
  if (mode !== "twilio") {
    console.log("📩 SMS SIMULÉ");
    console.log("➡️ À :", toNorm);
    console.log("➡️ Message :", body);
    console.log("--------------------------------------------------");
    return;
  }

  // ✅ Mode Twilio
  const client = getTwilioClient();
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!client || !from) {
    console.log("⚠️ Twilio non configuré => SMS SIMULÉ");
    console.log("➡️ À :", toNorm);
    console.log("➡️ Message :", body);
    console.log("--------------------------------------------------");
    return;
  }

  try {
    await client.messages.create({
      from,
      to: toNorm,
      body,
    });
    console.log("✅ SMS envoyé à", toNorm);
  } catch (e) {
    console.log("❌ Erreur SMS:", e?.message || e);
  }
}

function formatRappelSms(rdv) {
  const date = String(rdv.date_rdv).slice(0, 10);
  const hd = String(rdv.heure_debut).slice(0, 5);
  const hf = rdv.heure_fin ? String(rdv.heure_fin).slice(0, 5) : "";
  const plage = hf ? `${hd}-${hf}` : hd;

  return `Rappel: Vous avez un RDV demain ${date} à ${plage}. Merci de confirmer si possible.`;
}

function formatRdvSms(rdv, type = "create") {
  const date = String(rdv.date_rdv).slice(0, 10);
  const hd = String(rdv.heure_debut).slice(0, 5);
  const hf = rdv.heure_fin ? String(rdv.heure_fin).slice(0, 5) : "";
  const plage = hf ? `${hd}-${hf}` : hd;

  if (type === "update") {
    return `Votre RDV a été modifié: ${date} à ${plage}.`;
  }
  return `Confirmation RDV: ${date} à ${plage}.`;
}

/* =============================
   CORE MIDDLEWARE
============================= */
app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
const PORT = process.env.PORT || 3001;

/* =============================
   UPLOADS SETUP
============================= */
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeName = String(file.originalname || "file")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");
    cb(null, `${Date.now()}_${safeName}`);
  },
});

function fileFilter(req, file, cb) {
  const ok =
    file.mimetype.startsWith("image/") ||
    file.mimetype === "application/pdf" ||
    file.mimetype === "application/octet-stream";
  if (!ok) return cb(new Error("Type de fichier non autorisé (image/pdf)"));
  cb(null, true);
}

const upload = multer({
  storage: patientStorage,
  fileFilter,
  limits: { filesize: 25 * 1024 * 1024 },
});





app.use("/uploads", express.static(UPLOAD_DIR));

/* =============================
   UTIL: DB SAFE / ANTI-CASSE
============================= */
const tableColumnsCache = new Map();

async function getTableColumns(tableName) {
  if (tableColumnsCache.has(tableName)) return tableColumnsCache.get(tableName);
  const r = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1`,
    [tableName]
  );
  const cols = new Set(r.rows.map((x) => x.column_name));
  tableColumnsCache.set(tableName, cols);
  return cols;
}

function firstExisting(colsSet, candidates) {
  if (!colsSet || !(colsSet instanceof Set)) return null;
  for (const c of candidates) if (colsSet.has(c)) return c;
  return null;
}

/* =============================
   TEST DB CONNECTION
============================= */
(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("Connexion PostgreSQL réussie ✅");
  } catch (err) {
    console.log("Erreur connexion DB ❌", err.message);
  }
})();

/* =============================
   ROUTE TEST
============================= */
app.get("/", (req, res) => {
  res.send("API MATI SANTE PRO 🚀");
});
// =============================
// AUTH (JWT) - CONNEXION
// =============================
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// LOGIN
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email et password obligatoires" });
    }

    const r = await pool.query(
  "SELECT id, email, password_hash, role, is_active, cabinet_id FROM medecins WHERE email=$1 LIMIT 1",
  [email]
);

    if (r.rows.length === 0) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    const user = r.rows[0];

    if (user.is_active === false) {
      return res.status(403).json({ error: "Compte désactivé" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    const token = jwt.sign(
  { id: user.id, email: user.email, role: user.role, cabinet_id: user.cabinet_id },
  JWT_SECRET,
  { expiresIn: "7d" }
);


    return res.json({
  ok: true,
  token,
  user: {
    id: user.id,
    email: user.email,
    role: user.role,
    cabinet_id: user.cabinet_id
  },
});

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/reset-medecin-password-temp", async (req, res) => {
  try {
    const { email, newPassword } = req.body || {};

    if (!email || !newPassword) {
      return res.status(400).json({ error: "email et newPassword obligatoires" });
    }

    const hashed = await bcrypt.hash(String(newPassword), 10);

    const r = await pool.query(
      `
      UPDATE medecins
      SET password_hash = $1
      WHERE email = $2
      RETURNING id, nom, email, cabinet_id
      `,
      [hashed, String(email).trim().toLowerCase()]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Médecin introuvable" });
    }

    return res.json({
      ok: true,
      message: "Mot de passe réinitialisé",
      user: r.rows[0],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
// PATIENT REGISTER
app.post("/patient/register", async (req, res) => {
  try {
    const { nom, prenom, telephone, email, password, cabinet_id } = req.body;

    if (!telephone || !password || !cabinet_id) {
      return res.status(400).json({ error: "telephone, password et cabinet_id requis" });
    }

    const exist = await pool.query(
  "SELECT id FROM patients WHERE telephone=$1 OR email=$2 LIMIT 1",
  [telephone, email]
);

if (exist.rows.length > 0) {
  return res.status(409).json({
    error: "Ce numéro de téléphone ou cet email existe déjà"
  });
}

const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      `INSERT INTO patients(nom, prenom, telephone, email, password_hash, cabinet_id, is_mobile_account)
       VALUES($1,$2,$3,$4,$5,$6,true)
       RETURNING id, patient_app_id`,
      [nom, prenom, telephone, email, hash, cabinet_id]
    );
await pool.query(
  `
  INSERT INTO cabinet_patients (cabinet_id, patient_id)
  VALUES ($1, $2)
  ON CONFLICT (cabinet_id, patient_id) DO NOTHING
  `,
  [cabinet_id, r.rows[0].id]
);
    res.json({ success: true, patient: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "erreur serveur" });
  }
});


app.post("/patient/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "email et password requis" });
    }

    const r = await pool.query(
      "SELECT * FROM patients WHERE LOWER(TRIM(email)) = $1 LIMIT 1",
      [email]
    );

    if (r.rows.length === 0) {
      return res.status(401).json({ error: "patient introuvable" });
    }

    const patient = r.rows[0];
    const ok = await bcrypt.compare(password, patient.password_hash);

    if (!ok) {
      return res.status(401).json({ error: "mot de passe incorrect" });
    }

    res.json({
      success: true,
      patient: {
        id: patient.id,
        nom: patient.nom,
        prenom: patient.prenom,
        email: patient.email,
        telephone: patient.telephone,
        cabinet_id: patient.cabinet_id
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "erreur serveur" });
  }
});


// PATIENT LOGIN
app.post("/patient/login", async (req, res) => {
  try {
    const { telephone, password } = req.body;

    const r = await pool.query(
      "SELECT id, nom, prenom, password_hash, patient_app_id FROM patients WHERE telephone=$1",
      [telephone]
    );

    if (r.rows.length === 0) {
      return res.status(401).json({ error: "patient introuvable" });
    }

    const patient = r.rows[0];

    const ok = await bcrypt.compare(password, patient.password_hash);

    if (!ok) {
      return res.status(401).json({ error: "mot de passe incorrect" });
    }

    const token = jwt.sign(
      { patient_id: patient.id },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      token,
      patient: {
        id: patient.id,
        nom: patient.nom,
        prenom: patient.prenom,
        patient_app_id: patient.patient_app_id
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "erreur serveur" });
  }
});
app.get("/patient/:id/rdv", async (req, res) => {
  try {
    const patient_id = req.params.id;

    const p = await pool.query(
      "SELECT id FROM patients WHERE id = $1 LIMIT 1",
      [patient_id]
    );

    if (p.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const r = await pool.query(
      `
      SELECT *
      FROM rendez_vous
      WHERE patient_id = $1
      ORDER BY date_rdv DESC, heure_debut DESC NULLS LAST, id DESC
      `,
      [patient_id]
    );

    res.json({
      success: true,
      rdv: r.rows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "erreur serveur" });
  }
});

app.get("/patients/:id/documents", authRequired, staff, async (req, res) => {
  const { id } = req.params;

  try {
    const patient = await pool.query(
      `
      SELECT p.id
      FROM patients p
      JOIN cabinet_patients cp ON cp.patient_id = p.id
      WHERE p.id = $1 AND cp.cabinet_id = $2
      LIMIT 1
      `,
      [id, req.user.cabinet_id]
    );

    if (patient.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const result = await pool.query(
      `
      SELECT *
      FROM documents
      WHERE patient_id = $1
      ORDER BY id DESC
      `,
      [id]
    );

    res.json({
      success: true,
      documents: result.rows
    });
  } catch (err) {
    console.log("GET DOCUMENTS ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});


app.get("/patient/:id/documents", async (req, res) => {
  try {
    const patient_id = req.params.id;

    const p = await pool.query(
      "SELECT id FROM patients WHERE id = $1 LIMIT 1",
      [patient_id]
    );

    if (p.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const r = await pool.query(`
  SELECT *
  FROM documents
  WHERE patient_id = $1
  AND (
    source_document = 'patient'
    OR source_document = 'medecin'
    OR source_document = 'envoye_patient'
    OR source_document IS NULL
  )
  ORDER BY created_at DESC, id DESC
`, [patient_id]);

    res.json({
      success: true,
      documents: r.rows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "erreur serveur" });
  }
});


// /auth/me => retourne le user du token
app.get("/auth/me", authRequired, (req, res) => {
  return res.json({ ok: true, user: req.user });
});

// Middleware JWT
function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token) {
      return res.status(401).json({ error: "Token manquant" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

req.user = {
  id: decoded.id,
  email: decoded.email,
  role: decoded.role,
  cabinet_id: decoded.cabinet_id
};

return next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalide ou expiré" });
  }
}
function roleRequired(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Accès refusé" });
    }
    next();
  };
}

// RBAC (rôles)
function requireRole(...allowed) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ error: "Non authentifié" });
    if (!allowed.includes(role)) {
      return res.status(403).json({ error: "Accès interdit" });
    }
    return next();
  };
}



// =============================
// PATIENTS - CRUD (PRO)
// =============================

// LIST
app.get("/patients", authRequired, staff, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT p.*
      FROM patients p
      JOIN cabinet_patients cp ON cp.patient_id = p.id
      WHERE cp.cabinet_id = $1
        AND COALESCE(p.is_mobile_account, false) = false
        AND COALESCE(p.actif, true) = true
      ORDER BY p.id DESC
      `,
      [req.user.cabinet_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// =============================
// PATIENTS - CREATE (sans created_at/updated_at)
// =============================
app.post("/patients", authRequired, staff, async (req, res) => {
  try {
    const {
      nom,
      prenom,
      date_naissance,
      sexe,
      telephone,
      adresse,
      ville,
      cnas,
      email,
      groupe_sanguin,
      patient_app_id,
    } = req.body || {};

    if (!nom) {
      return res.status(400).json({ error: "nom obligatoire" });
    }

    // 🔎 Recherche GLOBALE du patient
    let existingPhone = null;
    if (telephone && String(telephone).trim() !== "") {
      const rPhone = await pool.query(
        "SELECT * FROM patients WHERE telephone=$1 LIMIT 1",
        [telephone]
      );
      if (rPhone.rows.length > 0) {
        existingPhone = rPhone.rows[0];
      }
    }

    let existingEmail = null;
    if (email && String(email).trim() !== "") {
      const rEmail = await pool.query(
        "SELECT * FROM patients WHERE email=$1 LIMIT 1",
        [email]
      );
      if (rEmail.rows.length > 0) {
        existingEmail = rEmail.rows[0];
      }
    }

    const existingPatient = existingPhone || existingEmail;

    // ✅ Si patient existe déjà globalement
    if (existingPatient) {
      // le remettre actif / compléter
      const updated = await pool.query(
        `
        UPDATE patients
        SET
          nom = $1,
          prenom = $2,
          date_naissance = $3,
          sexe = $4,
          telephone = $5,
          adresse = $6,
          ville = $7,
          cnas = $8,
          email = $9,
          groupe_sanguin = $10,
          patient_app_id = COALESCE($11, patient_app_id),
          actif = true,
          is_mobile_account = false
        WHERE id = $12
        RETURNING *
        `,
        [
          nom,
          prenom || null,
          date_naissance || null,
          sexe || null,
          telephone || null,
          adresse || null,
          ville || null,
          cnas || null,
          email || null,
          groupe_sanguin || null,
          patient_app_id || null,
          existingPatient.id,
        ]
      );

      // ✅ Lier ce patient au cabinet courant
      await pool.query(
        `
        INSERT INTO cabinet_patients (cabinet_id, patient_id)
        VALUES ($1, $2)
        ON CONFLICT (cabinet_id, patient_id) DO NOTHING
        `,
        [req.user.cabinet_id, existingPatient.id]
      );

      return res.json(updated.rows[0]);
    }

    // ✅ Sinon création normale
    const q = `
      INSERT INTO patients
      (nom, prenom, date_naissance, sexe, telephone, adresse, ville, cnas, email, groupe_sanguin, patient_app_id, cabinet_id, actif, is_mobile_account)
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,false)
      RETURNING *
    `;
    const r = await pool.query(q, [
      nom,
      prenom || null,
      date_naissance || null,
      sexe || null,
      telephone || null,
      adresse || null,
      ville || null,
      cnas || null,
      email || null,
      groupe_sanguin || null,
      patient_app_id || null,
      req.user.cabinet_id,
    ]);

    const patient = r.rows[0];

    const r2 = await pool.query(
      `
      UPDATE patients
      SET num_dossier = 'DS-' || LPAD(id::text, 4, '0')
      WHERE id = $1
      RETURNING *
      `,
      [patient.id]
    );

    // ✅ Lier aussi le nouveau patient au cabinet
    await pool.query(
      `
      INSERT INTO cabinet_patients (cabinet_id, patient_id)
      VALUES ($1, $2)
      ON CONFLICT (cabinet_id, patient_id) DO NOTHING
      `,
      [req.user.cabinet_id, patient.id]
    );

    return res.json(r2.rows[0]);
  } catch (err) {
    console.log("POST /patients ERROR:", err.message);

    if (err.code === "23505") {
      return res.status(409).json({ error: "Téléphone ou email déjà utilisé" });
    }

    return res.status(500).json({ error: err.message });
  }
});


// UPDATE
app.put("/patients/:id", authRequired, medecinOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const cur = await pool.query("SELECT * FROM patients WHERE id=$1", [id]);
    if (cur.rows.length === 0) return res.status(404).json({ error: "Patient introuvable" });
    if (req.body.telephone && String(req.body.telephone).trim() !== "") {
   
      const existingPhone = await pool.query(
  "SELECT id FROM patients WHERE telephone=$1 AND id<>$2 LIMIT 1",
  [req.body.telephone, id]
);

  if (existingPhone.rows.length > 0) {
    return res.status(409).json({ error: "Un autre patient avec ce téléphone existe déjà" });
  }
}
if (req.body.email && String(req.body.email).trim() !== "") {
  const existingEmail = await pool.query(
  "SELECT id FROM patients WHERE email=$1 AND id<>$2 LIMIT 1",
  [req.body.email, id]
);

  if (existingEmail.rows.length > 0) {
    return res.status(409).json({ error: "Un autre patient avec cet email existe déjà" });
  }
}

    const payload = {
      nom: req.body.nom,
      prenom: req.body.prenom,
      date_naissance: req.body.date_naissance,
      sexe: req.body.sexe,
      telephone: req.body.telephone,
      adresse: req.body.adresse,
      groupe_sanguin: req.body.groupe_sanguin,
    };

    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(payload)) {
      if (v === undefined) continue;
      params.push(v);
      sets.push(`${k}=$${params.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: "Aucun champ à modifier" });

    sets.push(`updated_at=NOW()`);
    params.push(id);

    const q = `UPDATE patients SET ${sets.join(", ")} WHERE id=$${params.length} RETURNING *`;
    const r = await pool.query(q, params);

    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
app.delete("/patients/:id", authRequired, medecinOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const check = await pool.query(
      `
      SELECT p.id
      FROM patients p
      JOIN cabinet_patients cp ON cp.patient_id = p.id
      WHERE p.id = $1 AND cp.cabinet_id = $2
      LIMIT 1
      `,
      [id, req.user.cabinet_id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const r = await pool.query(
      "UPDATE patients SET actif = false WHERE id=$1 RETURNING id",
      [id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    res.json({ ok: true, message: "Patient supprimé ✅" });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Téléphone ou email déjà utilisé pour ce cabinet" });
    }
    res.status(500).json({ error: err.message });
  }
});


/* =========================================================
   ======= LINK patient -> patients_app (AUTO) ==============
========================================================= */
app.post("/patients/:id/link-app", authRequired, staff, async (req, res) => {
  const { id } = req.params;

  try {
    const p = await pool.query(
      `
      SELECT p.*
      FROM patients p
      JOIN cabinet_patients cp ON cp.patient_id = p.id
      WHERE p.id = $1 AND cp.cabinet_id = $2
      LIMIT 1
      `,
      [id, req.user.cabinet_id]
    );

    if (p.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const patient = p.rows[0];

    if (patient.patient_app_id) {
      return res.json({
        message: "Déjà lié ✅",
        patient_app_id: patient.patient_app_id,
      });
    }

    const existing = await pool.query(
      "SELECT id FROM patients_app WHERE patient_id = $1 LIMIT 1",
      [patient.id]
    );

    if (existing.rows.length > 0) {
      const existingId = existing.rows[0].id;

      await pool.query(
        "UPDATE patients SET patient_app_id = $1 WHERE id = $2",
        [existingId, patient.id]
      );

      return res.json({
        message: "Lien resynchronisé ✅",
        patient_app_id: existingId,
      });
    }

    const r = await pool.query(
      `INSERT INTO patients_app (patient_id)
       VALUES ($1)
       RETURNING id`,
      [patient.id]
    );

    const patient_app_id = r.rows[0].id;

    await pool.query(
      "UPDATE patients SET patient_app_id = $1 WHERE id = $2",
      [patient_app_id, patient.id]
    );

    return res.json({
      message: "Lien créé ✅",
      patient_app_id,
    });
  } catch (err) {
    console.log("LINK-APP ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
/* =========================================================
   ==================== ALLERGIES ===========================
========================================================= */
app.get("/patients/:id/allergies", authRequired, staff, async (req, res) => {
  const { id } = req.params;
  try {
    const patient = await pool.query(
      `
      SELECT p.id
      FROM patients p
      JOIN cabinet_patients cp ON cp.patient_id = p.id
      WHERE p.id = $1 AND cp.cabinet_id = $2
      LIMIT 1
      `,
      [id, req.user.cabinet_id]
    );

    if (patient.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const result = await pool.query(
      "SELECT * FROM allergies WHERE patient_id=$1 ORDER BY id DESC",
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/patients/:id/allergies", authRequired, staff, async (req, res) => {
  const { id } = req.params;
  const { nom } = req.body;

  try {
    const patient = await pool.query(
      `
      SELECT p.id
      FROM patients p
      JOIN cabinet_patients cp ON cp.patient_id = p.id
      WHERE p.id = $1 AND cp.cabinet_id = $2
      LIMIT 1
      `,
      [id, req.user.cabinet_id]
    );

    if (patient.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const result = await pool.query(
      "INSERT INTO allergies (patient_id, nom) VALUES ($1,$2) RETURNING *",
      [id, nom]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/allergies/:id", authRequired, staff, async (req, res) => {
  const { id } = req.params;

  try {
    const check = await pool.query(
      `
      SELECT a.id
      FROM allergies a
      JOIN patients p ON p.id = a.patient_id
      JOIN cabinet_patients cp ON cp.patient_id = p.id
      WHERE a.id = $1 AND cp.cabinet_id = $2
      LIMIT 1
      `,
      [id, req.user.cabinet_id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Allergie introuvable" });
    }

    await pool.query("DELETE FROM allergies WHERE id=$1", [id]);

    res.json({ message: "Allergie supprimée ✅" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/patient/documents/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const r = await pool.query(
  `
  DELETE FROM documents
  WHERE id = $1
  RETURNING *
  `,
  [id]
);


    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Document introuvable" });
    }

    res.json({
      success: true,
      deleted: r.rows[0]
    });

  } catch (err) {
    console.log("DELETE PATIENT DOCUMENT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   ==================== ANTECEDENTS =========================
========================================================= */
app.get("/patients/:id/antecedents", authRequired, staff, async (req, res) => {
  const { id } = req.params;
  try {
    const patient = await pool.query(
      `
      SELECT p.id
      FROM patients p
      JOIN cabinet_patients cp ON cp.patient_id = p.id
      WHERE p.id = $1 AND cp.cabinet_id = $2
      LIMIT 1
      `,
      [id, req.user.cabinet_id]
    );

    if (patient.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const result = await pool.query(
      "SELECT * FROM antecedents WHERE patient_id=$1 ORDER BY id DESC",
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/patients/:id/antecedents", authRequired, staff, async (req, res) => {
  const { id } = req.params;
  const { nom } = req.body;

  try {
    const patient = await pool.query(
      `
      SELECT p.id
      FROM patients p
      JOIN cabinet_patients cp ON cp.patient_id = p.id
      WHERE p.id = $1 AND cp.cabinet_id = $2
      LIMIT 1
      `,
      [id, req.user.cabinet_id]
    );

    if (patient.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const result = await pool.query(
      "INSERT INTO antecedents (patient_id, nom) VALUES ($1,$2) RETURNING *",
      [id, nom]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/antecedents/:id", authRequired, staff, async (req, res) => {
  const { id } = req.params;

  try {
    const check = await pool.query(
      `
      SELECT a.id
      FROM antecedents a
      JOIN patients p ON p.id = a.patient_id
      JOIN cabinet_patients cp ON cp.patient_id = p.id
      WHERE a.id = $1 AND cp.cabinet_id = $2
      LIMIT 1
      `,
      [id, req.user.cabinet_id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Antécédent introuvable" });
    }

    await pool.query("DELETE FROM antecedents WHERE id=$1", [id]);

    res.json({ message: "Antécédent supprimé ✅" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/messages/:id", authRequired, staff, async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ error: "id message invalide" });
  }

  try {
    const r = await pool.query(
      `
      UPDATE messages
      SET lu = true
      WHERE id = $1 AND cabinet_id = $2
      RETURNING *
      `,
      [id, req.user.cabinet_id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Message introuvable" });
    }

    return res.json({ success: true, updated: r.rows[0] });
  } catch (err) {
    console.error("DELETE MESSAGE ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});


/* =========================================================
   ==================== CONSULTATIONS =======================
========================================================= */
app.get("/patients/:id/consultations", authRequired, staff, async (req, res) => {
  const { id } = req.params;

  try {
    const patient = await pool.query(
  `
  SELECT p.id
  FROM patients p
  JOIN cabinet_patients cp ON cp.patient_id = p.id
  WHERE p.id = $1 AND cp.cabinet_id = $2
  LIMIT 1
  `,
  [id, req.user.cabinet_id]
);
    if (patient.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const result = await pool.query(
      `SELECT *,
       COALESCE(compte_rendu, diagnostic, motif, traitement, etat_clinique, remarque_evolution) AS contenu
       FROM consultations
       WHERE patient_id=$1
       ORDER BY date_consultation DESC, id DESC`,
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



app.post("/consultations", authRequired, medecinOrAdmin, async (req, res) => {
  try {
    const {
      patient_id,
      motif,
      diagnostic,
      compte_rendu,
      etat_clinique,
      remarque_evolution,
      tension,
      temperature,
      poids,
      traitement
    } = req.body;

    const patient = await pool.query(
  `
  SELECT p.id
  FROM patients p
  JOIN cabinet_patients cp ON cp.patient_id = p.id
  WHERE p.id = $1 AND cp.cabinet_id = $2
  LIMIT 1
  `,
  [patient_id, req.user.cabinet_id]
);

    if (patient.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const result = await pool.query(
  `INSERT INTO consultations
   (patient_id, date_consultation, motif, diagnostic, etat_clinique, remarque_evolution,
    tension, temperature, poids, traitement, compte_rendu)
   VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10)
   RETURNING *`,
  [
    Number(patient_id),
    motif || null,
    diagnostic || null,
    etat_clinique || null,
    remarque_evolution || null,
    tension || null,
    temperature || null,
    poids || null,
    traitement || null,
    compte_rendu || null
  ]
);


    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
})
app.put("/consultations/:id", authRequired, medecinOrAdmin, async (req, res) => {
  try {
    const cols = await getTableColumns("consultations");
    const { id } = req.params;

    const current = await pool.query(
      `
      SELECT c.id
      FROM consultations c
      JOIN patients p ON p.id = c.patient_id
      JOIN cabinet_patients cp ON cp.patient_id = p.id
      WHERE c.id = $1 AND cp.cabinet_id = $2
      LIMIT 1
      `,
      [id, req.user.cabinet_id]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: "Consultation introuvable" });
    }

    const payload = {
      motif: req.body.motif ?? null,
      diagnostic: req.body.diagnostic ?? null,
      compte_rendu: req.body.compte_rendu ?? null,
      etat_clinique: req.body.etat_clinique ?? null,
      remarque_evolution: req.body.remarque_evolution ?? null,
      tension: req.body.tension ?? null,
      temperature: req.body.temperature ?? null,
      poids: req.body.poids ?? null,
      traitement: req.body.traitement ?? null,
    };

    const sets = [];
    const params = [];

    for (const [k, v] of Object.entries(payload)) {
      if (!cols.has(k)) continue;
      params.push(v);
      sets.push(`${k} = $${params.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "Aucun champ à modifier" });
    }

    params.push(id);

    const q = `
      UPDATE consultations
      SET ${sets.join(", ")}
      WHERE id = $${params.length}
      RETURNING *
    `;

    const result = await pool.query(q, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Consultation introuvable" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.log("PUT /consultations/:id ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});


app.delete("/consultations/:id", authRequired, staff, async (req, res) => {
  const { id } = req.params;

  try {
   const check = await pool.query(
  `
  SELECT c.id
  FROM consultations c
  JOIN patients p ON p.id = c.patient_id
  JOIN cabinet_patients cp ON cp.patient_id = p.id
  WHERE c.id = $1 AND cp.cabinet_id = $2
  LIMIT 1
  `,
  [id, req.user.cabinet_id]
);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Consultation introuvable" });
    }

    await pool.query("DELETE FROM consultations WHERE id=$1", [id]);

    res.json({ message: "Consultation supprimée ✅" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/patients/:id/timeline", authRequired, staff, async (req, res) => {
  const { id } = req.params;

  try {
    const patient = await pool.query(
  `
  SELECT p.id
  FROM patients p
  JOIN cabinet_patients cp ON cp.patient_id = p.id
  WHERE p.id = $1 AND cp.cabinet_id = $2
  LIMIT 1
  `,
  [id, req.user.cabinet_id]
);

    if (patient.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const consultations = await pool.query(
      `SELECT 
        id,
        date_consultation AS date,
        'consultation' AS type,
        motif,
        diagnostic,
        traitement
       FROM consultations
       WHERE patient_id=$1`,
      [id]
    );

    const documents = await pool.query(
      `SELECT
        id,
        created_at AS date,
        'document' AS type,
        titre,
        nom
       FROM documents
       WHERE patient_id=$1`,
      [id]
    );

    const timeline = [
      ...consultations.rows,
      ...documents.rows
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(timeline);

  } catch (err) {
    console.log("TIMELINE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});


/* =========================================================
   ==================== ANALYSES ============================
========================================================= */
app.get("/patients/:id/analyses", authRequired, staff, async (req, res) => {
  const { id } = req.params;

  try {
    const patient = await pool.query(
      `
      SELECT p.id, p.patient_app_id
      FROM patients p
      JOIN cabinet_patients cp ON cp.patient_id = p.id
      WHERE p.id = $1 AND cp.cabinet_id = $2
      LIMIT 1
      `,
      [id, req.user.cabinet_id]
    );

    if (patient.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const patient_app_id = patient.rows[0]?.patient_app_id || null;
    const cols = await getTableColumns("analyses");

    const hasPatientId = cols.has("patient_id");
    const hasPatientAppId = cols.has("patient_app_id");

    let query = "SELECT * FROM analyses";
    const where = [];
    const params = [];

    if (hasPatientAppId && patient_app_id) {
      params.push(patient_app_id);
      where.push(`patient_app_id = $${params.length}`);
    }

    if (hasPatientId) {
      params.push(Number(id));
      where.push(`patient_id = $${params.length}`);
    }

    if (where.length === 0) {
      return res.status(400).json({ error: "Aucune colonne compatible trouvée dans analyses" });
    }

    query += ` WHERE ${where.join(" OR ")} ORDER BY id DESC`;

    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.log("GET ANALYSES ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.delete("/analyses/:id", authRequired, staff, async (req, res) => {
  try {
    const id = Number(req.params.id);
    console.log("DELETE CHECK:", id, req.user.cabinet_id);

    const debugAnalyse = await pool.query(
      `
      SELECT a.id, a.patient_id, cp.cabinet_id
      FROM analyses a
      LEFT JOIN cabinet_patients cp ON cp.patient_id = a.patient_id
      WHERE a.id = $1
      `,
      [id]
    );

    console.log("DELETE DEBUG ANALYSE:", debugAnalyse.rows);

   const check = await pool.query(
  `
  SELECT a.id, a.patient_id, cp.cabinet_id
  FROM analyses a
  LEFT JOIN cabinet_patients cp ON cp.patient_id = a.patient_id
  WHERE a.id = $1
  LIMIT 1
  `,
  [id]
);

if (check.rows.length === 0) {
  return res.status(404).json({ error: "Analyse introuvable" });
}

const analyse = check.rows[0];

if (analyse.patient_id && analyse.cabinet_id !== req.user.cabinet_id) {
  return res.status(403).json({ error: "Accès interdit" });
}
    const r = await pool.query(
      "DELETE FROM analyses WHERE id = $1 RETURNING *",
      [id]
    );

    res.json({ message: "Analyse supprimée ✅", deleted: r.rows[0] });
  } catch (err) {
    console.log("DELETE ANALYSE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   ==================== IMAGERIE ============================
========================================================= */
app.get("/patients/:id/imagerie", authRequired, staff, async (req, res) => {
  const { id } = req.params;

  try {
    const patient = await pool.query(
  `
  SELECT p.id
  FROM patients p
  JOIN cabinet_patients cp ON cp.patient_id = p.id
  WHERE p.id = $1 AND cp.cabinet_id = $2
  LIMIT 1
  `,
  [id, req.user.cabinet_id]
);

    if (patient.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const result = await pool.query(
      "SELECT * FROM imagerie WHERE patient_id=$1 ORDER BY id DESC",
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/analyses", authRequired, medecinOrAdmin, upload.single("file"), async (req, res) => {
  try {
    const cols = await getTableColumns("analyses");

    const patient_id = req.body.patient_id ? Number(req.body.patient_id) : null;
    const consultation_id = req.body.consultation_id ? Number(req.body.consultation_id) : null;
    const medecin_id = req.user.id;

    const type_analyse = req.body.type_analyse || req.body.nom || "Analyse";
    const remarque = req.body.remarque || req.body.resultat || req.body.contenu || "";
    const date_analyse = req.body.date_analyse || null;
    const laboratoire = req.body.laboratoire || null;
    const date_resultat = req.body.date_resultat || null;
    const conclusion = req.body.conclusion || null;

    if (!patient_id) {
      return res.status(400).json({ error: "patient_id obligatoire" });
    }

    const p = await pool.query(
      `
      SELECT p.id, p.patient_app_id
      FROM patients p
      JOIN cabinet_patients cp ON cp.patient_id = p.id
      WHERE p.id = $1 AND cp.cabinet_id = $2
      LIMIT 1
      `,
      [patient_id, req.user.cabinet_id]
    );

    if (p.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const patient_app_id = p.rows[0]?.patient_app_id || null;

    const insertCols = [];
    const insertVals = [];
    const params = [];

    const push = (col, val) => {
      if (!cols.has(col)) return;
      insertCols.push(col);
      params.push(val);
      insertVals.push(`$${params.length}`);
    };

    push("patient_id", patient_id);
    push("patient_app_id", patient_app_id);
    push("medecin_id", medecin_id);
    if (consultation_id) push("consultation_id", consultation_id);

    push("nom", type_analyse);
    push("type_analyse", type_analyse);
    if (date_analyse) push("date_analyse", date_analyse);

    push("contenu", remarque);
    push("remarque", remarque);

    if (laboratoire) push("laboratoire", laboratoire);
    if (date_resultat) push("date_resultat", date_resultat);
    if (conclusion) push("conclusion", conclusion);

    if (req.file) {
  const uploaded = await cloudinary.uploader.upload(req.file.path, {
    folder: "mati-sante",
    resource_type: "auto",
    public_id: `analyse_${patient_id}_${Date.now()}`,
    overwrite: true,
  });

  if (fs.existsSync(req.file.path)) {
    fs.unlinkSync(req.file.path);
  }

  const savedPath = uploaded.secure_url;
  const fileCol = ["chemin_fichier", "fichier", "file", "path", "url", "contenu"].find((c) => cols.has(c));
  if (fileCol) push(fileCol, savedPath);
}


    if (insertCols.length === 0) {
      return res.status(400).json({ error: "Aucune colonne compatible trouvée dans analyses" });
    }

    const q = `
      INSERT INTO analyses (${insertCols.join(", ")})
      VALUES (${insertVals.join(", ")})
      RETURNING *
    `;

    const result = await pool.query(q, params);
    return res.json(result.rows[0]);
  } catch (err) {
    console.log("POST /analyses ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
app.post("/imagerie", authRequired, medecinOrAdmin, upload.single("file"), async (req, res) => {
  try {
    const patient_id = req.body?.patient_id ? Number(req.body.patient_id) : null;
    const type_imagerie = req.body?.type_imagerie || null;
    const remarque = req.body?.remarque || null;
   const fichier = req.file ? req.file.path : null;

    if (!patient_id) {
      return res.status(400).json({ error: "patient_id obligatoire" });
    }

    const patient = await pool.query(
  `
  SELECT p.id
  FROM patients p
  JOIN cabinet_patients cp ON cp.patient_id = p.id
  WHERE p.id = $1 AND cp.cabinet_id = $2
  LIMIT 1
  `,
  [patient_id, req.user.cabinet_id]
);
    if (patient.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const result = await pool.query(
      `INSERT INTO imagerie (patient_id, nom, contenu, fichier)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [patient_id, type_imagerie, remarque, fichier]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.log("IMAGERIE POST ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/imagerie/:id", authRequired, staff, async (req, res) => {
  const { id } = req.params;

  try {
    const check = await pool.query(
      `
      SELECT i.id, i.fichier
      FROM imagerie i
      JOIN patients p ON p.id = i.patient_id
      JOIN cabinet_patients cp ON cp.patient_id = p.id
      WHERE i.id = $1 AND cp.cabinet_id = $2
      LIMIT 1
      `,
      [id, req.user.cabinet_id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Imagerie introuvable" });
    }

    const row = check.rows[0];

    if (row.fichier && row.fichier.startsWith("/uploads/")) {
      const absolutePath = path.join(__dirname, row.fichier);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    }

    await pool.query("DELETE FROM imagerie WHERE id = $1", [id]);

    res.json({ message: "Imagerie supprimée ✅" });
  } catch (err) {
    console.log("DELETE /imagerie/:id ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   ==================== ORDONNANCES =========================
========================================================= */
app.get("/patients/:id/ordonnances", authRequired, staff, async (req, res) => {
  const { id } = req.params;

  try {
    const patient = await pool.query(
  `
  SELECT p.id
  FROM patients p
  JOIN cabinet_patients cp ON cp.patient_id = p.id
  WHERE p.id = $1 AND cp.cabinet_id = $2
  LIMIT 1
  `,
  [id, req.user.cabinet_id]
);

    if (patient.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const result = await pool.query(
      "SELECT * FROM ordonnances WHERE patient_id=$1 ORDER BY id DESC",
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    console.log("GET ORDONNANCES ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/ordonnances", authRequired, medecinOrAdmin, upload.single("file"), async (req, res) => {
  try {
    const cols = await getTableColumns("ordonnances");
    console.log("ORDONNANCES COLS =", Array.from(cols));

    const patient_id = req.body?.patient_id ? Number(req.body.patient_id) : null;
    const titre = req.body?.titre || "Ordonnance";
    const contenu =
      req.body?.contenu ||
      req.body?.texte ||
      req.body?.description ||
      req.body?.remarque ||
      req.body?.medicaments ||
      req.body?.details ||
      null;

    if (!patient_id) {
      return res.status(400).json({ error: "patient_id obligatoire" });
    }

    const patient = await pool.query(
  `
  SELECT p.id
  FROM patients p
  JOIN cabinet_patients cp ON cp.patient_id = p.id
  WHERE p.id = $1 AND cp.cabinet_id = $2
  LIMIT 1
  `,
  [patient_id, req.user.cabinet_id]
);

    if (patient.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    let fichierPath = req.file ? req.file.path : null;

if (!fichierPath && contenu) {
    fichierPath = await generateOrdonnancePdfAndUpload({
  titre,
  contenu,
  patient_id,
  cabinet_id: req.user.cabinet_id, // 👈 AJOUTE ÇA
});
}
    const insertCols = [];
    const insertVals = [];
    const params = [];

    const push = (col, val) => {
      if (!cols.has(col)) return;
      insertCols.push(col);
      params.push(val);
      insertVals.push(`$${params.length}`);
    };

    push("patient_id", patient_id);
    push("titre", titre);
    push("contenu", fichierPath || contenu);


    if (fichierPath) {
      const fileCol = firstExisting(cols, ["fichier", "chemin_fichier", "file", "url", "path"]);
      if (fileCol) push(fileCol, fichierPath);
    }

    if (insertCols.length === 0) {
      return res.status(400).json({ error: "Aucune colonne compatible trouvée dans ordonnances" });
    }

    const result = await pool.query(
      `INSERT INTO ordonnances (${insertCols.join(", ")})
       VALUES (${insertVals.join(", ")})
       RETURNING *`
      ,
      params
    );
    console.log("ORDONNANCE SAVED =", result.rows[0]); 
    res.json(result.rows[0]);
  } catch (err) {
    console.log("ORDONNANCE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }


});
app.post("/documents/send-existing-file", authRequired, medecinOrAdmin, async (req, res) => {
  try {
    const { patient_id, titre, fichier } = req.body || {};

    if (!patient_id || !fichier) {
      return res.status(400).json({ error: "patient_id et fichier requis" });
    }

    let savedPath = String(fichier).trim();

const isHttpFile =
  savedPath.startsWith("http://") || savedPath.startsWith("https://");

const isUploadFile = savedPath.startsWith("/uploads/");

if (!isHttpFile && !isUploadFile) {
  return res.status(400).json({ error: "Fichier invalide" });
}
    const p = await pool.query(
  `
  SELECT p.id
  FROM patients p
  JOIN cabinet_patients cp ON cp.patient_id = p.id
  WHERE p.id = $1 AND cp.cabinet_id = $2
  LIMIT 1
  `,
  [patient_id, req.user.cabinet_id]
);

    if (p.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

   const r = await pool.query(
  `
  INSERT INTO documents (patient_id, titre, contenu, nom, source_document)
  VALUES ($1, $2, $3, $4, 'envoye_patient')
  RETURNING *
  `,
  [
    patient_id,
    titre || "Document médical",
    savedPath,
    titre || "Document médical",
  ]
);

console.log("SEND EXISTING FILE SAVED =", r.rows[0]);

return res.json({
  success: true,
  document: r.rows[0],
});
  } catch (err) {
    console.log("SEND EXISTING FILE ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});  

app.delete("/ordonnances/:id", authRequired, staff, async (req, res) => {
  const { id } = req.params;

  try {
    const check = await pool.query(
  `
  SELECT o.id
  FROM ordonnances o
  JOIN patients p ON p.id = o.patient_id
  JOIN cabinet_patients cp ON cp.patient_id = p.id
  WHERE o.id = $1 AND cp.cabinet_id = $2
  LIMIT 1
  `,
  [id, req.user.cabinet_id]
);

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Ordonnance introuvable" });
    }

    await pool.query("DELETE FROM ordonnances WHERE id=$1", [id]);
    res.json({ message: "Ordonnance supprimée ✅" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// DOCUMENTS PATIENT
// =========================================================

app.get("/patients/:id/documents", authRequired, staff, async (req, res) => {
  const { id } = req.params;
  try {
    const patient = await pool.query(
      `
      SELECT p.id
      FROM patients p
      JOIN cabinet_patients cp ON cp.patient_id = p.id
      WHERE p.id = $1 AND cp.cabinet_id = $2
      LIMIT 1
      `,
      [id, req.user.cabinet_id]
    );

    if (patient.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const result = await pool.query(
      `
      SELECT *
      FROM documents
      WHERE patient_id = $1
        AND source_document = 'patient'
      ORDER BY id DESC
      `,
      [id]
    );

    res.json({
      success: true,
      documents: result.rows
    });
  } catch (err) {
    console.log("GET DOCUMENTS ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ⬇️ AJOUTE LA NOUVELLE ROUTE ICI ⬇️

app.post("/patients/:id/documents", authRequired, medecinOrAdmin, async (req, res) => {
  const { id } = req.params;
  const { titre, nom, contenu } = req.body;

  try {
   const patient = await pool.query(
  `
  SELECT p.id
  FROM patients p
  JOIN cabinet_patients cp ON cp.patient_id = p.id
  WHERE p.id = $1 AND cp.cabinet_id = $2
  LIMIT 1
  `,
  [id, req.user.cabinet_id]
);

    if (patient.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const result = await pool.query(
      `INSERT INTO documents (patient_id, titre, nom, contenu, source_document)
 VALUES ($1,$2,$3,$4,'medecin')
 RETURNING *`,
      [
        id,
        titre || null,
        nom || null,
        contenu || null
      ]
    );

    res.json(result.rows[0]);

  } catch (err) {
    console.log("POST DOCUMENT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.post("/patient/message", async (req, res) => {
  try {
    const { patient_id, cabinet_id, contenu } = req.body || {};

    if (!patient_id || !cabinet_id || !contenu || !String(contenu).trim()) {
      return res.status(400).json({ error: "patient_id, cabinet_id et contenu requis" });
    }

    const p = await pool.query(
      "SELECT id FROM patients WHERE id = $1 LIMIT 1",
      [patient_id]
    );

    if (p.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const r = await pool.query(
      `
      INSERT INTO messages (patient_id, cabinet_id, contenu, sender)
      VALUES ($1, $2, $3, 'patient')
      RETURNING id, contenu AS message, sender AS expediteur_type, created_at
      `,
      [patient_id, cabinet_id, String(contenu).trim()]
    );

    res.json({
      success: true,
      message: r.rows[0]
    });
  } catch (e) {
    console.error("POST /patient/message ERROR:", e);
    res.status(500).json({ error: "erreur serveur" });
  }
});
app.get("/patient/:id/messages", async (req, res) => {
  try {
    const patient_id = Number(req.params.id);
    const cabinet_id = req.query.cabinet_id ? Number(req.query.cabinet_id) : null;

    if (!patient_id) {
      return res.status(400).json({ error: "patient_id requis" });
    }

    const p = await pool.query(
  "SELECT id FROM patients WHERE id = $1 LIMIT 1",
  [patient_id]
);

    if (p.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    let r;

    if (cabinet_id) {
      r = await pool.query(
        `
        SELECT
          id,
          contenu AS message,
          sender AS expediteur_type,
          created_at,
          cabinet_id
        FROM messages
        WHERE patient_id = $1 AND cabinet_id = $2
        ORDER BY created_at ASC
        `,
        [patient_id, cabinet_id]
      );
    } else {
      r = await pool.query(
        `
        SELECT
          id,
          contenu AS message,
          sender AS expediteur_type,
          created_at,
          cabinet_id
        FROM messages
        WHERE patient_id = $1
        ORDER BY created_at ASC
        `,
        [patient_id]
      );
    }

    res.json({
      success: true,
      messages: r.rows
    });
  } catch (e) {
    console.error("GET /patient/:id/messages ERROR:", e);
    res.status(500).json({ error: "erreur serveur" });
  }
});




app.post("/documents", upload.single("file"), async (req, res) => {


  try {
    const patient_id = req.body?.patient_id ? Number(req.body.patient_id) : null;
    const titre = req.body?.titre || "Document";
    const contenu =
      req.body?.note ||
      req.body?.contenu ||
      req.body?.texte ||
      req.body?.description ||
      req.body?.remarque ||
      "";

    if (!patient_id) {
      return res.status(400).json({ error: "patient_id obligatoire" });
    }

    const filePath = req.file
      ? (req.file.path || `/uploads/${req.file.filename}`)
      : null;

    const nom = req.file?.originalname || titre;
    const finalContenu = filePath || contenu;

    const result = await pool.query(
      `
      INSERT INTO documents (patient_id, titre, contenu, nom, source_document)
      VALUES ($1, $2, $3, $4, 'medecin')
      RETURNING *
      `,
      [patient_id, titre, finalContenu, nom]
    );

    res.json({
      success: true,
      document: result.rows[0]
    });
  } catch (err) {
    console.log("DOCUMENT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});



async function ensureParametresRow() {
  const res = await pool.query("SELECT id FROM parametres LIMIT 1");

  if (res.rows.length === 0) {
    const insert = await pool.query(`
      INSERT INTO parametres (cabinet_nom)
      VALUES ('Cabinet')
      RETURNING id
    `);
    return insert.rows[0].id;
  }

  return res.rows[0].id;
}

app.put("/parametres", async (req, res) => {
  try {
    const id = await ensureParametresRow();

    const payload = {
      cabinet_nom: req.body.cabinet_nom ?? null,
      medecin_nom: req.body.medecin_nom ?? null,
      adresse: req.body.adresse ?? null,
      telephone: req.body.telephone ?? null,
      email: req.body.email ?? null,
      ville: req.body.ville ?? null,
      note_entete: req.body.note_entete ?? null,
    };

    const upd = await pool.query(
      `UPDATE parametres SET
        cabinet_nom=$1,
        medecin_nom=$2,
        adresse=$3,
        telephone=$4,
        email=$5,
        ville=$6,
        note_entete=$7,
        updated_at=NOW()
       WHERE id=$8
       RETURNING *`,
      [
        payload.cabinet_nom,
        payload.medecin_nom,
        payload.adresse,
        payload.telephone,
        payload.email,
        payload.ville,
        payload.note_entete,
        id,
      ]
    );

    res.json(upd.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/parametres", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM parametres LIMIT 1");

    if (result.rows.length === 0) {
      return res.json({});
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/parametres/logo", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier envoyé" });
    const id = await ensureParametresRow();
    const savedPath = `/uploads/${req.file.filename}`;
    await pool.query("UPDATE parametres SET logo_path=$1, updated_at=NOW() WHERE id=$2", [savedPath, id]);
    res.json({ message: "Logo enregistré ✅", logo_path: savedPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/parametres/signature", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier envoyé" });
    const id = await ensureParametresRow();
    const savedPath = `/uploads/${req.file.filename}`;
    await pool.query("UPDATE parametres SET signature_path=$1, updated_at=NOW() WHERE id=$2", [savedPath, id]);
    res.json({ message: "Signature enregistrée ✅", signature_path: savedPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/parametres/cachet", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier envoyé" });
    const id = await ensureParametresRow();
    const savedPath = `/uploads/${req.file.filename}`;
    await pool.query("UPDATE parametres SET cachet_path=$1, updated_at=NOW() WHERE id=$2", [savedPath, id]);
    res.json({ message: "Cachet enregistré ✅", cachet_path: savedPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   ==================== RDV (PRO) ===========================
   - Anti-chevauchement (check SQL)
   - SMS confirmation (create/update) (simulé ou Twilio)
   - Audit /rdv/:id/audit
   - Rappel 2h avant (job UNIQUE, anti-doublon DB)
========================================================= */

// -------------------------
// Utils validation
// -------------------------
function isValidTime(t) {
  return typeof t === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(t);
}
function isValidISODate(d) {
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

// -------------------------
// Anti-chevauchement (check SQL)
// -------------------------
async function checkRdvConflict({
  date_rdv,
  heure_debut,
  heure_fin,
  cabinet_id,
  excludeId = null
}) {
  const q = `
    SELECT id
    FROM rendez_vous
    WHERE date_rdv = $1::date
      AND cabinet_id = $2
      AND statut <> 'annule'
      AND ($5::int IS NULL OR id <> $5::int)
      AND (
        heure_debut < COALESCE($4::time, ($3::time + interval '30 min')::time)
        AND COALESCE(heure_fin, (heure_debut + interval '30 min')::time) > $3::time
      )
    LIMIT 1
  `;

  const r = await pool.query(q, [
    date_rdv,
    cabinet_id,
    heure_debut,
    heure_fin || null,
    excludeId
  ]);

  return r.rows.length > 0;
}

// -------------------------
// SELECT RDV + infos patient (tel)
// -------------------------
async function selectRdvJoinedById(id) {
  const q = `
    SELECT
      rv.*,
      COALESCE(p.nom, rv.patient_nom) AS nom,
      COALESCE(p.prenom, rv.patient_prenom) AS prenom,
      COALESCE(p.telephone, rv.patient_telephone) AS telephone
    FROM rendez_vous rv
    LEFT JOIN patients p ON p.id = rv.patient_id
    WHERE rv.id = $1
    LIMIT 1
  `;
  const r = await pool.query(q, [id]);
  return r.rows[0] || null;
}

// -------------------------
// SMS (format)
// -------------------------
function formatRdvSms(rdv, type = "create") {
  const date = String(rdv.date_rdv).slice(0, 10);
  const hd = String(rdv.heure_debut).slice(0, 5);
  const hf = rdv.heure_fin ? String(rdv.heure_fin).slice(0, 5) : "";
  const plage = hf ? `${hd}-${hf}` : hd;
  if (type === "update") return `✅ RDV modifié : ${date} à ${plage}.`;
  return `✅ Confirmation RDV : ${date} à ${plage}.`;
}

function formatRappel2hSms(rdv) {
  const date = String(rdv.date_rdv).slice(0, 10);
  const hd = String(rdv.heure_debut).slice(0, 5);
  return `⏰ Rappel : vous avez un RDV aujourd’hui (${date}) à ${hd}.`;
}

// =========================================================
// GET RDV (jour)  ✅ table: rdv  ✅ colonnes existantes
// =========================================================
app.get("/rdv", authRequired, async (req, res) => {
  try {
    const date = req.query.date || null;

    const r = await pool.query(
      `
      SELECT
        rv.id,
        rv.date_rdv,
        rv.heure_debut AS heure,
        rv.motif,
        rv.statut,
        COALESCE(p.nom, rv.patient_nom) AS nom,
        COALESCE(p.prenom, rv.patient_prenom) AS prenom
      FROM rendez_vous rv
      LEFT JOIN patients p ON p.id = rv.patient_id
      WHERE rv.cabinet_id = $2
AND rv.statut IN ('prevu','confirme')
AND ($1::date IS NULL OR rv.date_rdv::date = $1::date)
      `,
      [date, req.user.cabinet_id]
    );

    res.json(r.rows);
  } catch (err) {
    console.log("GET /rdv error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// RDV SEMAINE
// =========================================================
app.get("/rdv/week", authRequired, async (req, res) => {
  try {
    const { start } = req.query;
    if (!start) return res.status(400).json({ error: "start obligatoire (YYYY-MM-DD)" });
    if (!isValidISODate(start)) return res.status(400).json({ error: "start invalide (YYYY-MM-DD)" });

    const baseSelect = `
  SELECT
    rv.*,
    COALESCE(p.nom, rv.patient_nom) AS nom,
    COALESCE(p.prenom, rv.patient_prenom) AS prenom,
    COALESCE(p.telephone, rv.patient_telephone) AS telephone
  FROM rendez_vous rv
  LEFT JOIN patients p ON p.id = rv.patient_id
`;

const r = await pool.query(
  `
  ${baseSelect}
  WHERE rv.cabinet_id = $2
    AND rv.date_rdv >= $1::date
    AND rv.date_rdv < ($1::date + interval '7 day')
  ORDER BY rv.date_rdv ASC, rv.heure_debut ASC, rv.id ASC
  `,
  [start, req.user.cabinet_id]
);

res.json(r.rows);
} catch (err) {
  console.log("GET /rdv/week error:", err.message);
  res.status(500).json({ error: err.message });
}
});

// =========================================================
// STATS RDV
// =========================================================
app.get("/rdv/stats", async (req, res) => {
  try {
    const { from, to } = req.query;
    const fromDate = from && isValidISODate(from) ? from : null;
    const toDate = to && isValidISODate(to) ? to : null;

    const range = await pool.query(
      `
      SELECT
        COALESCE($1::date, date_trunc('month', CURRENT_DATE)::date) AS from_date,
        COALESCE($2::date, (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date) AS to_date
      `,
      [fromDate, toDate]
    );

    const from_date = range.rows[0].from_date;
    const to_date = range.rows[0].to_date;

    const totals = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN statut='prevu' THEN 1 ELSE 0 END)::int AS prevu,
        SUM(CASE WHEN statut='confirme' THEN 1 ELSE 0 END)::int AS confirme,
        SUM(CASE WHEN statut='annule' THEN 1 ELSE 0 END)::int AS annule,
        SUM(CASE WHEN statut='termine' THEN 1 ELSE 0 END)::int AS termine
      FROM rendez_vous
      WHERE date_rdv BETWEEN $1::date AND $2::date
      `,
      [from_date, to_date]
    );

    const bySource = await pool.query(
      `
      SELECT source, COUNT(*)::int AS count
      FROM rendez_vous
      WHERE date_rdv BETWEEN $1::date AND $2::date
      GROUP BY source
      ORDER BY count DESC
      `,
      [from_date, to_date]
    );

    const byDay = await pool.query(
      `
      SELECT date_rdv::date AS day, COUNT(*)::int AS count
      FROM rendez_vous
      WHERE date_rdv BETWEEN $1::date AND $2::date
      GROUP BY day
      ORDER BY day ASC
      `,
      [from_date, to_date]
    );

    res.json({
      range: { from: from_date, to: to_date },
      totals: totals.rows[0],
      bySource: bySource.rows,
      byDay: byDay.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// CREATE RDV + SMS confirmation (anti-double DB)
// =========================================================
app.post("/rdv", async (req, res) => {
  try {
    const {
      patient_id,
      patient_nom,
      patient_prenom,
      patient_telephone,
      source,
      date_rdv,
      date,
      heure_debut,
      heure,
      heure_fin,
      motif,
      statut,
      notes,
    } = req.body;

    const cabinet_id = Number(req.body.cabinet_id) || 1;

    // Compatibilité PC + mobile
    const dateFinal = date_rdv || date || null;
    const heureDebutFinal = heure_debut || heure || null;

    // Date/heure facultatives pour demande mobile
    if (dateFinal && !isValidISODate(dateFinal)) {
      return res.status(400).json({ error: "date invalide (YYYY-MM-DD)" });
    }

    if (heureDebutFinal && !isValidTime(heureDebutFinal)) {
      return res.status(400).json({ error: "heure invalide (HH:MM)" });
    }

    if (heure_fin && !isValidTime(heure_fin)) {
      return res.status(400).json({ error: "heure_fin invalide (HH:MM)" });
    }

    if (
      heure_fin &&
      heureDebutFinal &&
      String(heure_fin) <= String(heureDebutFinal)
    ) {
      return res
        .status(400)
        .json({ error: "heure_fin doit être > heure_debut" });
    }

    const hasPatientId = !!patient_id;

    if (!hasPatientId) {
      if (!patient_nom || !patient_telephone) {
        return res.status(400).json({
          error: "patient_nom et patient_telephone obligatoires si patient_id absent",
        });
      }
    }

    // Vérifier conflit seulement si date + heure sont fournies
    if (dateFinal && heureDebutFinal) {
      const conflict = await checkRdvConflict({
        date_rdv: dateFinal,
        heure_debut: heureDebutFinal,
        heure_fin: heure_fin || null,
        cabinet_id,
        excludeId: null,
      });

      if (conflict) {
        return res
          .status(409)
          .json({ error: "Créneau déjà occupé (conflit RDV) ❌" });
      }
    }

    const ins = await pool.query(
      `INSERT INTO rendez_vous
       (patient_id, patient_nom, patient_prenom, patient_telephone, source,
        date_rdv, heure_debut, heure_fin, motif, statut, notes, cabinet_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        hasPatientId ? Number(patient_id) : null,
        patient_nom || null,
        patient_prenom || null,
        patient_telephone || null,
        source || (hasPatientId ? "logiciel" : "mobile"),
        dateFinal,
        heureDebutFinal,
        heure_fin || null,
        motif || null,
        statut || "demande",
        notes || null,
        cabinet_id,
      ]
    );

    const out = await selectRdvJoinedById(ins.rows[0].id);

    // SMS confirmation (async)
    setImmediate(async () => {
      try {
        if (!out?.telephone) return;
        const msg = formatRdvSms(out, "create");
        const hasFlag = await hasSmsConfirmFlagColumn();

        if (!hasFlag) {
          await sendSms(out.telephone, msg);
          return;
        }

        const check = await pool.query(
          "SELECT sms_confirm_envoye FROM rendez_vous WHERE id=$1",
          [out.id]
        );

        if (check.rows?.[0]?.sms_confirm_envoye) return;

        await sendSms(out.telephone, msg);

        await pool.query(
          "UPDATE rendez_vous SET sms_confirm_envoye=TRUE, sms_confirm_envoye_at=NOW(), updated_at=NOW() WHERE id=$1",
          [out.id]
        );
      } catch (e) {
        console.log("❌ Erreur flag sms_confirm_envoye:", e?.message || e);
      }
    });

    res.json(out);
  } catch (err) {
    if (String(err.code) === "23P01") {
      return res
        .status(409)
        .json({ error: "Créneau déjà occupé (conflit RDV) ❌" });
    }
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// UPDATE RDV + SMS modification
// =========================================================
app.put("/rdv/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const cabinetId = req.user?.cabinet_id || req.user?.cabinetId || 1;

    const cur = await pool.query(
      "SELECT * FROM rendez_vous WHERE id=$1 AND cabinet_id=$2",
      [id, cabinetId]
    );

    if (cur.rows.length === 0) {
      return res.status(404).json({ error: "RDV introuvable" });
    }

    const current = cur.rows[0];
    const nextDate = req.body.date_rdv ?? current.date_rdv;
    const nextStart = req.body.heure_debut ?? current.heure_debut;
    const nextEnd = req.body.heure_fin !== undefined ? req.body.heure_fin : current.heure_fin;

    if (req.body.date_rdv && !isValidISODate(req.body.date_rdv)) {
      return res.status(400).json({ error: "date_rdv invalide (YYYY-MM-DD)" });
    }
    if (req.body.heure_debut && !isValidTime(req.body.heure_debut)) {
      return res.status(400).json({ error: "heure_debut invalide (HH:MM)" });
    }
    if (req.body.heure_fin && !isValidTime(req.body.heure_fin)) {
      return res.status(400).json({ error: "heure_fin invalide (HH:MM)" });
    }
    if (nextEnd && String(nextEnd) <= String(nextStart)) {
      return res.status(400).json({ error: "heure_fin doit être > heure_debut" });
    }

    if (nextDate && nextStart) {
      const conflict = await checkRdvConflict({
        date_rdv: nextDate,
        heure_debut: nextStart,
        heure_fin: nextEnd || null,
        cabinet_id: cabinetId,
        excludeId: Number(id),
      });
      if (conflict) {
        return res.status(409).json({ error: "Créneau déjà occupé (conflit RDV) ❌" });
      }
    }

    const payload = {
      patient_id: req.body.patient_id,
      patient_nom: req.body.patient_nom,
      patient_prenom: req.body.patient_prenom,
      patient_telephone: req.body.patient_telephone,
      source: req.body.source,
      date_rdv: req.body.date_rdv,
      heure_debut: req.body.heure_debut,
      heure_fin: req.body.heure_fin,
      motif: req.body.motif,
      statut: req.body.statut,
      notes: req.body.notes,
    };

    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(payload)) {
      if (v === undefined) continue;
      params.push(v);
      sets.push(`${k}=$${params.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "Aucun champ à modifier" });
    }

    sets.push(`updated_at=NOW()`);
    params.push(id);
    params.push(cabinetId);

    const q = `UPDATE rendez_vous
               SET ${sets.join(", ")}
               WHERE id=$${params.length - 1} AND cabinet_id=$${params.length}
               RETURNING id`;

    const r = await pool.query(q, params);

    if (r.rows.length === 0) {
      return res.status(404).json({ error: "RDV introuvable" });
    }

    const out = await selectRdvJoinedById(r.rows[0].id);

    setImmediate(async () => {
      try {
        if (!out?.telephone) return;
        const msg = formatRdvSms(out, "update");
        await sendSms(out.telephone, msg);
      } catch (e) {
        console.log("❌ Erreur SMS update:", e?.message || e);
      }
    });

    res.json(out);
  } catch (err) {
    if (String(err.code) === "23P01") {
      return res.status(409).json({ error: "Créneau déjà occupé (conflit RDV) ❌" });
    }
    res.status(500).json({ error: err.message });
  }
});


// =========================================================
// DELETE RDV (delete réel)
// =========================================================
app.delete("/rdv/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;

    const r = await pool.query(
      "DELETE FROM rendez_vous WHERE id=$1 AND cabinet_id=$2 RETURNING id",
      [id, req.user.cabinet_id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ error: "RDV introuvable" });
    }

    res.json({ message: "RDV supprimé ✅" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// CRENEAUX LIBRES JOUR
// =========================================================

app.get("/rdv/free-slots", authRequired, async (req, res) => {
  try {
    const date = req.query.date;
    const step = Number(req.query.step || 30);

    if (!date) {
      return res.status(400).json({ error: "date obligatoire (YYYY-MM-DD)" });
    }

    const r = await pool.query(
      `SELECT heure_debut, heure_fin
       FROM rendez_vous
       WHERE date_rdv=$1
         AND cabinet_id=$2
         AND statut <> 'annule'
       ORDER BY heure_debut`,
      [date, req.user.cabinet_id]
    );

    const slots = [];
    const startHour = 9;
    const endHour = 18;

    const toMinutes = (hhmm) => {
      if (!hhmm) return null;
      const [h, m] = String(hhmm).slice(0, 5).split(":").map(Number);
      return h * 60 + m;
    };

    const occupiedRanges = r.rows.map((x) => {
      const start = toMinutes(x.heure_debut);
      const end = x.heure_fin ? toMinutes(x.heure_fin) : start + 30;
      return {
        start,
        end
      };
    });

    for (let h = startHour; h < endHour; h++) {
      for (let m = 0; m < 60; m += step) {
        const slot = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        const slotStart = toMinutes(slot);
        const slotEnd = slotStart + step;

        const overlaps = occupiedRanges.some((range) => {
          return slotStart < range.end && slotEnd > range.start;
        });

        if (!overlaps) {
          slots.push(slot);
        }
      }
    }

    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/rdv/next-free", authRequired, async (req, res) => {
  try {
    const step = Number(req.query.step || 30);
    const cabinetId = req.user?.cabinet_id || req.user?.cabinetId || 1;

    const { rows } = await pool.query(
      `
      SELECT *
      FROM rendez_vous
      WHERE ($1::int IS NULL OR cabinet_id = $1::int)
      ORDER BY created_at DESC
      `,
      [cabinetId]
    );

    const toMinutes = (hhmm) => {
      const [h, m] = String(hhmm || "00:00").slice(0, 5).split(":").map(Number);
      return h * 60 + m;
    };

    const toISODateLocal = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    let date = new Date();

    for (let d = 0; d < 30; d++) {
      const dateStr = toISODateLocal(date);

      const dayRdv = rows.filter(
        (x) =>
          x.date_rdv &&
          toISODateLocal(new Date(x.date_rdv)) === dateStr &&
          x.statut !== "annule"
      );

      const occupied = dayRdv.map((x) => {
        const start = toMinutes(x.heure_debut);
        const end = x.heure_fin ? toMinutes(x.heure_fin) : start + step;
        return { start, end };
      });

      for (let h = 9; h < 18; h++) {
        for (let m = 0; m < 60; m += step) {
          const slotStart = h * 60 + m;
          const slotEnd = slotStart + step;

          const conflict = occupied.some(
            (o) => slotStart < o.end && slotEnd > o.start
          );

          if (!conflict) {
            const heure = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
            return res.json({
              date: dateStr,
              heure,
            });
          }
        }
      }

      date.setDate(date.getDate() + 1);
    }

    res.json({ message: "Aucun créneau disponible" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// =========================================================
// AUDIT RDV (UNIQUE route)
// =========================================================
app.get("/rdv/:id/audit", authRequired, staff, async (req, res) => {
  try {
    const { id } = req.params;

    const exists = await pool.query(
      "SELECT id FROM rendez_vous WHERE id=$1 AND cabinet_id=$2",
      [id, req.user.cabinet_id]
    );

    if (exists.rows.length === 0) {
      return res.status(404).json({ error: "RDV introuvable" });
    }

    const r = await pool.query(
      `SELECT id, action, note, created_at, old_data, new_data
       FROM rdv_audit
       WHERE rdv_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// RAPPEL 2H AVANT (job UNIQUE, anti-doublon)
// Pré-requis : colonne start_ts remplie par ton trigger rdv_compute_ts()
// Utilise rappel_envoye_at TIMESTAMP pour bloquer double envoi.
// =========================================================
async function processRappels2h() {
  try {
    const q = `
WITH due AS (
  SELECT id
  FROM rendez_vous
  WHERE statut <> 'annule'
    AND rappel_envoye_at IS NULL
    AND start_ts IS NOT NULL
    AND start_ts >= NOW() + interval '2 hours'
    AND start_ts < NOW() + interval '2 hours 2 minutes'
  FOR UPDATE SKIP LOCKED
)
UPDATE rendez_vous rv
SET rappel_envoye_at = NOW(), updated_at = NOW()
FROM due
WHERE rv.id = due.id
RETURNING rv.id;
`;
    const r = await pool.query(q);

    for (const row of r.rows) {
      const full = await selectRdvJoinedById(row.id);
      const to = full?.telephone || full?.patient_telephone;
      if (!to) continue;

      const msg = formatRappel2hSms(full);
      await sendSms(to, msg);
    }

    if (r.rows.length > 0) {
      console.log(`✅ Rappels 2h envoyés: ${r.rows.length}`);
    }
  } catch (err) {
    console.log("❌ Erreur processRappels2h:", err.message);
  }
}

// 1er check au démarrage + toutes les 60s
setTimeout(processRappels2h, 5000);
setInterval(processRappels2h, 60 * 1000);
console.log("✅ Job rappel 2h actif (toutes les 60s)");

// =========================================================
// USERS (MEDECINS) - CRUD (PRO) ✅
// - GET /users        => liste (id, nom, email, role, actif)
// - POST /users       => créer (hash password)
// - PUT /users/:id    => modifier (nom, email, role, actif)
// - PUT /users/:id/password => changer mot de passe
// - DELETE /users/:id => supprimer
// Protégé par JWT: authRequired
// =========================================================



// Petit helper: est-ce admin ?
function requireAdmin(req, res, next) {
  // selon ton token: req.user.role
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Accès refusé (admin uniquement)" });
  }
  next();
}

// GET /users (liste)
app.get("/users", authRequired, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, nom, email, role, is_active, created_at, updated_at
       FROM medecins
       ORDER BY id DESC`
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /users (créer)
app.post("/users", authRequired, requireAdmin, async (req, res) => {
  try {
    const { nom, email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email et password obligatoires" });
    }

    const safeRole = role || "medecin";
    if (!["admin", "medecin", "secretaire"].includes(safeRole)) {
      return res.status(400).json({ error: "role invalide" });
    }

    const exists = await pool.query(
      `SELECT id FROM medecins WHERE email=$1`,
      [email]
    );
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: "Email déjà utilisé" });
    }

    const password_hash = await bcrypt.hash(String(password), 10);

    // on prend simplement le 1er cabinet existant
    const cab = await pool.query(
      `SELECT id FROM cabinets ORDER BY id ASC LIMIT 1`
    );

    const cabinet_id = cab.rows?.[0]?.id;
    if (!cabinet_id) {
      return res.status(400).json({ error: "Aucun cabinet trouvé" });
    }

    const created = await pool.query(
      `INSERT INTO medecins (nom, email, password_hash, role, is_active, cabinet_id)
       VALUES ($1,$2,$3,$4,TRUE,$5)
       RETURNING id, nom, email, role, is_active, cabinet_id`,
      [nom || null, email, password_hash, safeRole, cabinet_id]
    );

    res.json(created.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
  return res.status(409).json({ error: "Email déjà utilisé" });
}
res.status(500).json({ error: err.message });
  }
});

app.post("/create-cabinet", async (req, res) => {
  try {
    const {
  nom_cabinet,
  nom_medecin,
  telephone,
  adresse,
  ville,
  email,
  password,
} = req.body || {};


    if (!nom_cabinet || !nom_medecin || !email || !password) {
      return res.status(400).json({
        error: "nom_cabinet, nom_medecin, email et password sont obligatoires",
      });
    }

    const emailCheck = await pool.query(
      `SELECT id FROM medecins WHERE email = $1 LIMIT 1`,
      [String(email).trim().toLowerCase()]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ error: "Email déjà utilisé" });
    }

    const cabinetInsert = await pool.query(
      `
      INSERT INTO cabinets (nom, adresse, telephone, ville)
VALUES ($1, $2, $3, $4)
RETURNING id, nom, adresse, telephone, ville
      `,
      [
  String(nom_cabinet).trim(),
  adresse ? String(adresse).trim() : null,
  telephone ? String(telephone).trim() : null,
  ville ? String(ville).trim() : null,
]
    );

    const cabinet = cabinetInsert.rows[0];
    const password_hash = await bcrypt.hash(String(password), 10);

    const userInsert = await pool.query(
      `
      INSERT INTO medecins (nom, email, password_hash, role, is_active, cabinet_id)
      VALUES ($1, $2, $3, $4, TRUE, $5)
      RETURNING id, nom, email, role, is_active, cabinet_id
      `,
      [
        String(nom_medecin).trim(),
        String(email).trim().toLowerCase(),
        password_hash,
        "admin",
        cabinet.id,
      ]
    );

    return res.json({
      ok: true,
      message: "Cabinet créé avec succès",
      cabinet,
      admin: userInsert.rows[0],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
// PUT /users/:id (modifier)
app.put("/users/:id", authRequired, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, email, role, is_active } = req.body;

    const current = await pool.query(`SELECT * FROM medecins WHERE id=$1`, [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: "Utilisateur introuvable" });

    const safeRole = role ?? current.rows[0].role ?? null;
    if (safeRole && !["admin", "medecin", "secretaire"].includes(safeRole)) {
      return res.status(400).json({ error: "role invalide" });
    }

    // update “souple”: on update seulement ce qui existe
    const cols = await getTableColumns("medecins");
    const sets = [];
    const params = [];

    const push = (col, val) => {
      if (!cols.has(col) || val === undefined) return;
      params.push(val);
      sets.push(`${col}=$${params.length}`);
    };

    push("nom", nom);
    push("email", email);
    push("role", safeRole);
    push("is_active", is_active);

    if (cols.has("updated_at")) sets.push(`updated_at=NOW()`);

    if (sets.length === 0) return res.status(400).json({ error: "Aucun champ à modifier" });

    params.push(id);
    const q = `UPDATE medecins SET ${sets.join(", ")} WHERE id=$${params.length}
               RETURNING id, nom, email, role, is_active, updated_at`;
    const r = await pool.query(q, params);

    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /users/:id/password (changer mot de passe)
app.put("/users/:id/password", authRequired, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "password obligatoire" });

    const password_hash = await bcrypt.hash(String(password), 10);

    const r = await pool.query(
      `UPDATE medecins SET password_hash=$1, updated_at=NOW()
       WHERE id=$2
       RETURNING id, email`,
      [password_hash, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Utilisateur introuvable" });

    res.json({ ok: true, user: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /users/:id
app.delete("/users/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;

    // option sécurité: empêcher de désactiver soi-même
    if (String(req.user?.id) === String(id)) {
      return res.status(400).json({ error: "Tu ne peux pas désactiver ton propre compte" });
    }

    const r = await pool.query(
      `UPDATE medecins
       SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1
       RETURNING id, nom, email, role, is_active`,
      [id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    res.json({ ok: true, user: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/documents/:id/classer-analyse", authRequired, medecinOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const docRes = await pool.query(
      "SELECT * FROM documents WHERE id = $1",
      [id]
    );

    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: "Document introuvable" });
    }

    const d = docRes.rows[0];

    // récupérer le patient_app_id
    const p = await pool.query(
      "SELECT patient_app_id FROM patients WHERE id=$1",
      [d.patient_id]
    );

    const patient_app_id = p.rows[0]?.patient_app_id;

    const savedFile =
  d.contenu || d.fichier || d.file || d.uri || d.chemin_fichier;

const insertRes = await pool.query(
  `INSERT INTO analyses (patient_app_id, nom, contenu, fichier, created_at)
   VALUES ($1, $2, $3, $4, NOW())
   RETURNING *`,
  [
    patient_app_id,
    d.nom || d.titre || "Analyse patient",
    savedFile,
    savedFile
  ]
);

    await pool.query("DELETE FROM documents WHERE id = $1", [id]);

    console.log("ANALYSE INSEREE =", insertRes.rows[0]);

    res.json({ success: true, analyse: insertRes.rows[0] });

  } catch (err) {
    console.log("CLASSER ANALYSE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});
// ==============================
// GET RDV DEMANDES (PC)
// ==============================
app.get("/rdv-demandes", authRequired, async (req, res) => {
  try {
    const cabinetId = req.user?.cabinet_id || req.user?.cabinetId || 1;

    const { rows } = await pool.query(
      `
      SELECT *
      FROM rendez_vous
      WHERE statut = 'demande'
        AND ($1::int IS NULL OR cabinet_id = $1::int)
      ORDER BY created_at DESC
      `,
      [cabinetId]
    );

    console.log("DEMANDES TROUVEES =", rows); // 👈 pour vérifier

    res.json(rows);
  } catch (err) {
    console.log("❌ /rdv-demandes error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ================= DASHBOARD ================= */
app.get("/dashboard/stats", async (req, res) => {
  try {
    const patients = await pool.query(
  "SELECT COUNT(*) FROM patients WHERE is_mobile_account = false AND actif = true"
);
    const consultations = await pool.query(
      "SELECT COUNT(*) FROM consultations WHERE date_consultation = CURRENT_DATE"
    );
    const rdv = await pool.query(
      "SELECT COUNT(*) FROM rendez_vous WHERE date_rdv = CURRENT_DATE AND statut <> 'annule'"
    );
    const demandes = await pool.query(
      "SELECT COUNT(*) FROM rendez_vous WHERE statut = 'demande'"
    );

    res.json({
      patients: Number(patients.rows[0].count || 0),
      consultations: Number(consultations.rows[0].count || 0),
      rendezvous: Number(rdv.rows[0].count || 0),
      demandes: Number(demandes.rows[0].count || 0),
    });
  } catch (err) {
    console.log("DASHBOARD STATS ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/dashboard/document-recu-notification", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        d.id,
        d.nom,
        d.titre,
        d.contenu,
        d.created_at,
        COALESCE(p.nom, '') || ' ' || COALESCE(p.prenom, '') AS patient_nom
      FROM documents d
      LEFT JOIN patients p ON p.id = d.patient_id
      WHERE COALESCE(d.lu_dashboard, false) = false
        AND COALESCE(d.source_document, 'patient') = 'patient'
      ORDER BY d.created_at DESC, d.id DESC
      LIMIT 1
    `);
    res.json(r.rows[0] || null);
  } catch (err) {
    console.log("DASHBOARD DOCUMENT NOTIF ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.post("/dashboard/document-recu-notification/:id/read", async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      `
      UPDATE documents
      SET lu_dashboard = true
      WHERE id = $1
      `,
      [id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.log("DASHBOARD DOCUMENT READ ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.get("/dashboard/documents-count", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT COUNT(*)
      FROM documents
      WHERE COALESCE(lu_dashboard,false) = false
        AND COALESCE(source_document, 'patient') = 'patient'
    `);
    res.json({ count: Number(r.rows[0].count || 0) });
  } catch (err) {
    console.log("DOC COUNT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.get("/medicaments", async (req, res) => {
  try {
    const search = req.query.search || "";

    // 👉 SI VIDE → favoris
    if (!search) {
      const r = await pool.query(`
        SELECT id, nom
        FROM medicaments
        WHERE LOWER(nom) IN (
          'paracétamol',
          'amoxicilline',
          'zanidip',
          'metformine',
          'ventoline',
          'doliprane',
          'augmentin',
          'cardensiel'
        )
        ORDER BY nom ASC
        LIMIT 20
      `);

      return res.json(r.rows);
    }

    // 👉 SINON → recherche intelligente
    const r = await pool.query(
      `
      SELECT id, nom
      FROM medicaments
      WHERE nom ILIKE $1
      ORDER BY 
        CASE 
          WHEN LOWER(nom) LIKE LOWER($2) THEN 0
          WHEN LOWER(nom) LIKE LOWER($3) THEN 1
          ELSE 2
        END,
        LENGTH(nom),
        nom ASC
      LIMIT 20
      `,
      [
        `%${search}%`,
        `${search}%`,
        `%${search}%`
      ]
    );

    res.json(r.rows);
  } catch (err) {
    console.log("MED ERROR", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/posologie", async (req,res)=>{
  try{

    const search = req.query.search || ""

    const r = await pool.query(
      `SELECT posologie
       FROM posologies
       WHERE medicament ILIKE $1
       LIMIT 1`,
       [`%${search}%`]
    )

    res.json(r.rows[0] || {})

  }catch(err){
    console.log(err)
    res.status(500).json({error:err.message})
  }
})


app.get("/test-backend", (req, res) => {
  console.log("TEST BACKEND OK");
  res.json({ ok: true });
});
// =============================
// ASSISTANT INTELLIGENT PATIENT
// =============================
app.get("/patients/:id/assistant-summary", authRequired, staff, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const patient = await pool.query(
      "SELECT nom, prenom FROM patients WHERE id=$1",
      [id]
    );

    const allergies = await pool.query(
      "SELECT nom FROM allergies WHERE patient_id=$1",
      [id]
    );

    const lastConsult = await pool.query(
      "SELECT date_consultation FROM consultations WHERE patient_id=$1 ORDER BY date_consultation DESC LIMIT 1",
      [id]
    );

    const lastAnalyse = await pool.query(
      "SELECT type_analyse FROM analyses WHERE patient_id=$1 ORDER BY id DESC LIMIT 1",
      [id]
    );

   const ordonnances = await pool.query(
  "SELECT created_at FROM ordonnances WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 1",
  [id]
);

const lastOrdonnance = ordonnances.rows[0]?.created_at || null;

res.json({
  patient: patient.rows[0] || null,
  allergies: allergies.rows,
  lastConsultation: lastConsult.rows[0] || null,
  lastAnalyse: lastAnalyse.rows[0] || null,
  lastOrdonnance
});

    const alerts = [];

    if (allergies.rows.length > 0) {
      alerts.push("Allergies enregistrées");
    }

    if (lastAnalyse.rows.length === 0) {
      alerts.push("Aucune analyse récente");
    }

    res.json({
      patient: patient.rows[0] || null,
      allergies: allergies.rows,
      lastConsultation: lastConsult.rows[0] || null,
      lastAnalyse: lastAnalyse.rows[0] || null,
      lastOrdonnance: lastOrdonnance.rows[0] || null,
      alerts
    });

  } catch (err) {
    console.log("ASSISTANT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.get("/rdv-mobile", async (req, res) => {
  try {
    const { statut, telephone } = req.query;

    let sql = `
      SELECT
        r.id,
        r.patient_nom,
        r.patient_prenom,
        r.patient_telephone,
        r.date_rdv,
        r.heure_debut,
        r.heure_fin,
        r.motif,
        r.statut,
        r.notes,
        r.created_at,
        c.nom AS cabinet_nom
      FROM rendez_vous r
      LEFT JOIN cabinets c ON c.id = r.cabinet_id
      WHERE 1=1
      AND r.statut != 'annule'
    `;

    const params = [];

    if (statut) {
      params.push(String(statut).trim());
      sql += ` AND r.statut = $${params.length}`;
    }

    if (telephone) {
      params.push(String(telephone).trim());
      sql += ` AND r.patient_telephone = $${params.length}`;
    }

    sql += ` ORDER BY r.created_at DESC`;

    const result = await pool.query(sql, params);
    res.json(result.rows);

  } catch (err) {
    console.log("ERREUR RDV MOBILE:", err);
    res.status(500).json({ error: err.message });
  }
});
app.put("/rdv-mobile/:id/annuler", async (req, res) => {
  try {
    const { id } = req.params;

    const r = await pool.query(
      `UPDATE rendez_vous
       SET statut = 'annule', updated_at = NOW()
       WHERE id = $1
       RETURNING id, statut`,
      [id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ error: "RDV introuvable" });
    }

    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/messages", authRequired, staff, async (req, res) => {
  try {
    const { patient_id } = req.query;

    if (!patient_id) {
      return res.status(400).json({ error: "patient_id requis" });
    }

    const r = await pool.query(
      `
      SELECT *
      FROM messages
      WHERE patient_id = $1 AND cabinet_id = $2
      ORDER BY created_at ASC
      `,
      [patient_id, req.user.cabinet_id]
    );

    res.json(r.rows);
  } catch (err) {
    console.log("GET /messages ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.post("/messages", authRequired, staff, async (req, res) => {
  try {
    const patient_id = req.body.patient_id;
    const contenu = req.body.contenu || req.body.message || "";

    if (!patient_id || !contenu.trim()) {
      return res.status(400).json({ error: "patient_id et contenu requis" });
    }

    const r = await pool.query(
      `
      INSERT INTO messages (patient_id, cabinet_id, contenu, sender)
      VALUES ($1, $2, $3, 'medecin')
      RETURNING *
      `,
      [patient_id, req.user.cabinet_id, contenu]
    );

    res.json(r.rows[0]);
  } catch (err) {
    console.log("POST /messages ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.post("/upload-patient", patientUpload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    console.log("UPLOAD PATIENT FILE =", file);
    const { telephone } = req.body;

    if (!file) {
      return res.status(400).json({ error: "Aucun fichier" });
    }

    if (!telephone) {
      return res.status(400).json({ error: "Téléphone manquant" });
    }

    const patientResult = await pool.query(
      `SELECT id FROM patients WHERE telephone = $1 LIMIT 1`,
      [telephone]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable avec ce téléphone" });
    }

    const patientId = patientResult.rows[0].id;
    console.log("UPLOAD PATIENT -> patientId =", patientId);

    await pool.query(
  `INSERT INTO documents (patient_id, titre, contenu, nom, created_at, source_document)
   VALUES ($1, $2, $3, $4, NOW(), 'patient')`,
  [
    patientId,
    file.originalname,
    "/uploads/" + file.filename,
    file.originalname,
  ]
);


    return res.json({
      success: true,
      fichier: file.filename,
      patient_id: patientId,
    });
  } catch (err) {
    console.log("UPLOAD PATIENT ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
app.delete("/patient/documents/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const r = await pool.query(
      `
      SELECT *
      FROM documents
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Document introuvable" });
    }

    const doc = r.rows[0];
    const filePath = doc.contenu || doc.fichier || doc.url || null;

    if (filePath && String(filePath).startsWith("/uploads/")) {
      const absolutePath = path.join(__dirname, filePath);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    }

    await pool.query(
      `
      DELETE FROM documents
      WHERE id = $1
      `,
      [id]
    );

    res.json({
      success: true,
      deleted: doc
    });
  } catch (err) {
    console.log("DELETE PATIENT DOCUMENT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});


app.get("/patient/:id/home-stats", async (req, res) => {
  try {
    const patient_id = Number(req.params.id);

    if (!patient_id) {
      return res.status(400).json({ error: "patient_id invalide" });
    }

    const patient = await pool.query(
      "SELECT id FROM patients WHERE id = $1 LIMIT 1",
      [patient_id]
    );

    if (patient.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const messagesResult = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM messages
      WHERE patient_id = $1
        AND sender = 'medecin'
      `,
      [patient_id]
    );

    const documentsResult = await pool.query(
  `
  SELECT COUNT(*)::int AS count
  FROM documents
  WHERE patient_id = $1
    AND (
      source_document = 'medecin'
      OR source_document = 'envoye_patient'
      OR source_document IS NULL
    )
  `,
  [patient_id]
);

    return res.json({
      success: true,
      stats: {
        messages: Number(messagesResult.rows[0]?.count || 0),
        documents: Number(documentsResult.rows[0]?.count || 0),
      },
    });
  } catch (err) {
    console.log("HOME STATS ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
app.get("/patient/:id/conversations", async (req, res) => {
  try {
    const patient_id = Number(req.params.id);

    if (!patient_id) {
      return res.status(400).json({ error: "patient_id requis" });
    }

    const p = await pool.query(
      "SELECT id FROM patients WHERE id = $1 LIMIT 1",
      [patient_id]
    );

    if (p.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable" });
    }

    const r = await pool.query(
      `
      SELECT
        m.cabinet_id,
        COALESCE(c.nom, 'Cabinet') AS cabinet_nom,
        MAX(m.created_at) AS last_message_at
      FROM messages m
      LEFT JOIN cabinets c ON c.id = m.cabinet_id
      WHERE m.patient_id = $1
        AND m.cabinet_id IS NOT NULL
      GROUP BY m.cabinet_id, c.nom
      ORDER BY MAX(m.created_at) DESC
      `,
      [patient_id]
    );

    return res.json({
      success: true,
      conversations: r.rows
    });
  } catch (e) {
    console.error("GET /patient/:id/conversations ERROR:", e);
    return res.status(500).json({ error: "erreur serveur" });
  }
});
app.post("/avis-medicaux", authRequired, async (req, res) => {
  try {
    const { patient_id, destinataire_id, objet, message } = req.body || {};

    if (!req.user?.id || !req.user?.cabinet_id) {
      return res.status(401).json({ error: "Utilisateur non authentifié" });
    }

    if (!patient_id || !destinataire_id || !objet || !message) {
      return res.status(400).json({ error: "patient_id, destinataire_id, objet et message requis" });
    }

    const patientCheck = await pool.query(
      `
      SELECT p.id
      FROM patients p
      JOIN cabinet_patients cp ON cp.patient_id = p.id
      WHERE p.id = $1 AND cp.cabinet_id = $2
      LIMIT 1
      `,
      [patient_id, req.user.cabinet_id]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ error: "Patient introuvable dans ce cabinet" });
    }

    const avisResult = await pool.query(
      `
      INSERT INTO avis_medicaux (
        patient_id,
        cabinet_id,
        demandeur_id,
        destinataire_id,
        objet,
        statut,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, 'en_attente', NOW())
      RETURNING *
      `,
      [patient_id, req.user.cabinet_id, req.user.id, destinataire_id, objet]
    );

    const avis = avisResult.rows[0];

    await pool.query(
      `
      INSERT INTO avis_messages (
        avis_id,
        auteur_id,
        message,
        created_at
      )
      VALUES ($1, $2, $3, NOW())
      `,
      [avis.id, req.user.id, message]
    );

    return res.json({
      success: true,
      avis
    });
  } catch (err) {
    console.log("CREATE AVIS ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});app.get("/avis-medicaux", authRequired, async (req, res) => {
  try {
    if (!req.user?.id || !req.user?.cabinet_id) {
      return res.status(401).json({ error: "Utilisateur non authentifié" });
    }

    const result = await pool.query(
      `
      SELECT
        a.*,
        p.nom AS patient_nom,
        p.prenom AS patient_prenom,
        md.nom AS demandeur_nom,
       NULL AS demandeur_prenom,
       mt.nom AS destinataire_nom,
       NULL AS destinataire_prenom
      FROM avis_medicaux a
      LEFT JOIN patients p ON p.id = a.patient_id
      LEFT JOIN medecins md ON md.id = a.demandeur_id
      LEFT JOIN medecins mt ON mt.id = a.destinataire_id
      WHERE a.cabinet_id = $1
        AND (a.demandeur_id = $2 OR a.destinataire_id = $2)
      ORDER BY a.created_at DESC
      `,
      [req.user.cabinet_id, req.user.id]
    );

    return res.json(result.rows);
  } catch (err) {
    console.log("LIST AVIS ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
app.get("/avis-medicaux/:id/messages", authRequired, async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user?.id || !req.user?.cabinet_id) {
      return res.status(401).json({ error: "Utilisateur non authentifié" });
    }

    const avisCheck = await pool.query(
      `
      SELECT id
      FROM avis_medicaux
      WHERE id = $1
        AND cabinet_id = $2
        AND (demandeur_id = $3 OR destinataire_id = $3)
      LIMIT 1
      `,
      [id, req.user.cabinet_id, req.user.id]
    );

    if (avisCheck.rows.length === 0) {
      return res.status(404).json({ error: "Avis introuvable" });
    }

    const result = await pool.query(
      `
      SELECT
        m.*,
        med.nom AS auteur_nom,
        med.prenom AS auteur_prenom
      FROM avis_messages m
      LEFT JOIN medecins med ON med.id = m.auteur_id
      WHERE m.avis_id = $1
      ORDER BY m.created_at ASC
      `,
      [id]
    );

    return res.json(result.rows);
  } catch (err) {
    console.log("GET AVIS MESSAGES ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
app.post("/avis-medicaux/:id/messages", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body || {};

    if (!req.user?.id || !req.user?.cabinet_id) {
      return res.status(401).json({ error: "Utilisateur non authentifié" });
    }

    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "Message requis" });
    }

    const avisCheck = await pool.query(
      `
      SELECT *
      FROM avis_medicaux
      WHERE id = $1
        AND cabinet_id = $2
        AND (demandeur_id = $3 OR destinataire_id = $3)
      LIMIT 1
      `,
      [id, req.user.cabinet_id, req.user.id]
    );

    if (avisCheck.rows.length === 0) {
      return res.status(404).json({ error: "Avis introuvable" });
    }

    const avis = avisCheck.rows[0];

    const msgResult = await pool.query(
      `
      INSERT INTO avis_messages (
        avis_id,
        auteur_id,
        message,
        created_at
      )
      VALUES ($1, $2, $3, NOW())
      RETURNING *
      `,
      [id, req.user.id, String(message).trim()]
    );

    if (avis.statut === "en_attente" && String(avis.destinataire_id) === String(req.user.id)) {
      await pool.query(
        `
        UPDATE avis_medicaux
        SET statut = 'repondu'
        WHERE id = $1
        `,
        [id]
      );
    }

    return res.json({
      success: true,
      messageData: msgResult.rows[0]
    });
  } catch (err) {
    console.log("POST AVIS MESSAGE ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/plateforme/cabinets", authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, nom, adresse, telephone, ville
      FROM cabinets
      ORDER BY nom ASC
      `
    );

    return res.json(result.rows);
  } catch (err) {
    console.log("GET CABINETS PLATEFORME ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
app.get("/cabinets", async (req, res) => {
  try {
    const ville = (req.query.ville || req.query.wilaya || "").trim();

    let query = `
      SELECT id, nom, adresse, telephone, ville
      FROM cabinets
    `;
    const params = [];

    if (ville) {
      query += ` WHERE LOWER(TRIM(ville)) = LOWER(TRIM($1))`;
      params.push(ville);
    }

    query += ` ORDER BY nom ASC`;

    const result = await pool.query(query, params);

    return res.json(result.rows);
  } catch (err) {
    console.log("GET /cabinets ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});



app.get("/plateforme/cabinets/:id/medecins", authRequired, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT id, nom, email
      FROM medecins
      WHERE cabinet_id = $1
      ORDER BY nom ASC
      `,
      [id]
    );

    return res.json(result.rows);
  } catch (err) {
    console.log("GET MEDECINS CABINET ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
app.delete("/avis-medicaux/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user?.id || !req.user?.cabinet_id) {
      return res.status(401).json({ error: "Utilisateur non authentifié" });
    }

    const check = await pool.query(
      `
      SELECT id
      FROM avis_medicaux
      WHERE id = $1
        AND cabinet_id = $2
        AND (demandeur_id = $3 OR destinataire_id = $3)
      LIMIT 1
      `,
      [id, req.user.cabinet_id, req.user.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Avis introuvable" });
    }

    await pool.query(
      `
      DELETE FROM avis_medicaux
      WHERE id = $1
      `,
      [id]
    );

    return res.json({ success: true, message: "Avis supprimé ✅" });
  } catch (err) {
    console.log("DELETE AVIS ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
app.get("/rdv-mobile/occupied", async (req, res) => {
  try {
    const { cabinet_id, date } = req.query;

    if (!cabinet_id || !date) {
      return res.status(400).json({ error: "cabinet_id et date requis" });
    }

    const result = await pool.query(
      `SELECT heure_debut 
       FROM rendez_vous 
       WHERE cabinet_id = $1 
       AND date_rdv = $2`,
      [cabinet_id, date]
    );

    res.json(result.rows);
  } catch (err) {
    console.log("ERROR occupied:", err.message);
    res.status(500).json({ error: err.message });
  }
});


app.delete("/patient/:patientId/conversations/:cabinetId", async (req, res) => {
  try {
    const { patientId, cabinetId } = req.params;

    await pool.query(
      `DELETE FROM messages
       WHERE patient_id = $1 AND cabinet_id = $2`,
      [patientId, cabinetId]
    );

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});


app.delete("/patient/message/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { patient_id } = req.body;

    console.log("DELETE MESSAGE ID:", id); // 👈 debug

    const result = await pool.query(
      "DELETE FROM messages WHERE id = $1 AND patient_id = $2 RETURNING *",
[id, patient_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Message introuvable" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.log("DELETE ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
app.get("/dashboard/messages-count", authRequired, async (req, res) => {
  try {
   const result = await pool.query(
  `
  SELECT COUNT(*) 
  FROM messages 
  WHERE sender = 'patient'
  AND cabinet_id = $1
  AND lu = false
  AND contenu IS NOT NULL
  AND TRIM(contenu) <> ''
  `,
  [req.user.cabinet_id]
);

    res.json({
      count: Number(result.rows[0].count),
    });
  } catch (err) {
    console.log("MESSAGES COUNT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/messages/mark-read", authRequired, staff, async (req, res) => {
  const patient_id = Number(req.query.patient_id);

  if (!patient_id) {
    return res.status(400).json({ error: "patient_id invalide" });
  }

  try {
    await pool.query(
      `
      UPDATE messages
      SET lu = true
      WHERE patient_id = $1
        AND cabinet_id = $2
        AND sender = 'patient'
        AND lu = false
      `,
      [patient_id, req.user.cabinet_id]
    );

    return res.json({ success: true });
  } catch (err) {
    console.log("MARK READ MESSAGES ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
app.get("/debug/delete-analyses", async (req, res) => {
  try {
    await pool.query("TRUNCATE TABLE analyses RESTART IDENTITY");
    res.json({ message: "analyses supprimées ✅" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "erreur suppression" });
  }
});
app.listen(PORT, () => {
  console.log(`Serveur PRO lancé sur le port ${PORT} 🚀`);
});
