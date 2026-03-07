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

const app = express();

app.use("/uploads", express.static("uploads"));

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
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
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

const medecinOrAdmin = requireRole("medecin", "admin");
const staff = requireRole("secretaire", "medecin", "admin");


// =============================
// PATIENTS - CRUD (PRO)
// =============================

// LIST
app.get("/patients", authRequired, medecinOrAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM patients WHERE cabinet_id=$1 ORDER BY id DESC",
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
app.post("/patients", authRequired, medecinOrAdmin, async (req, res) => {
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

    const q = `
      INSERT INTO patients
(nom, prenom, date_naissance, sexe, telephone, adresse, ville, cnas, email, groupe_sanguin, patient_app_id, cabinet_id)
VALUES
($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
      req.user.cabinet_id
    ]);

    return res.json(r.rows[0]);
  } catch (err) {
    console.log("POST /patients ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// UPDATE
app.put("/patients/:id", authRequired, medecinOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const cur = await pool.query("SELECT * FROM patients WHERE id=$1", [id]);
    if (cur.rows.length === 0) return res.status(404).json({ error: "Patient introuvable" });

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
    const r = await pool.query("DELETE FROM patients WHERE id=$1 RETURNING id", [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Patient introuvable" });
    res.json({ ok: true, message: "Patient supprimé ✅" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* =========================================================
   ======= LINK patient -> patients_app (AUTO) ==============
========================================================= */
app.post("/patients/:id/link-app", async (req, res) => {
  const { id } = req.params;

  try {
    const p = await pool.query("SELECT * FROM patients WHERE id=$1", [id]);
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

    // Comme ta table patients_app ne contient que:
    // id, patient_id, created_at
    const r = await pool.query(
      `INSERT INTO patients_app (patient_id)
       VALUES ($1)
       RETURNING id`,
      [patient.id]
    );

    const patient_app_id = r.rows[0].id;

    await pool.query(
      "UPDATE patients SET patient_app_id=$1 WHERE id=$2",
      [patient_app_id, id]
    );

    res.json({ message: "Lien créé ✅", patient_app_id });
  } catch (err) {
    console.log("LINK-APP ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});
/* =========================================================
   ==================== ALLERGIES ===========================
========================================================= */
app.get("/patients/:id/allergies", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM allergies WHERE patient_id=$1 ORDER BY id DESC", [id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/patients/:id/allergies", async (req, res) => {
  const { id } = req.params;
  const { nom } = req.body;
  try {
    const result = await pool.query("INSERT INTO allergies (patient_id, nom) VALUES ($1,$2) RETURNING *", [id, nom]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/allergies/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM allergies WHERE id=$1", [id]);
    res.json({ message: "Allergie supprimée ✅" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/documents/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query("DELETE FROM documents WHERE id=$1", [id]);
    res.json({ message: "Document supprimé ✅" });
  } catch (err) {
    console.log("DELETE DOCUMENT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});
/* =========================================================
   ==================== ANTECEDENTS =========================
========================================================= */
app.get("/patients/:id/antecedents", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM antecedents WHERE patient_id=$1 ORDER BY id DESC", [id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/patients/:id/antecedents", async (req, res) => {
  const { id } = req.params;
  const { nom } = req.body;
  try {
    const result = await pool.query("INSERT INTO antecedents (patient_id, nom) VALUES ($1,$2) RETURNING *", [id, nom]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/antecedents/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM antecedents WHERE id=$1", [id]);
    res.json({ message: "Antécédent supprimé ✅" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   ==================== CONSULTATIONS =======================
========================================================= */
app.get("/patients/:id/consultations", async (req, res) => {
  const { id } = req.params;
  try {
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

app.post("/consultations", async (req, res) => {
  try {

    const {
      patient_id,
      medecin_id,
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

    const result = await pool.query(
      `INSERT INTO consultations
(patient_id, motif, diagnostic, etat_clinique, remarque_evolution,
 tension, temperature, poids, traitement, compte_rendu)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        Number(patient_id),
        medecin_id ? Number(medecin_id) : 1,
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
});

app.put("/consultations/:id", async (req, res) => {
  try {
    const cols = await getTableColumns("consultations");
    const { id } = req.params;

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
      sets.push(`${k}=$${params.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "Aucune colonne à mettre à jour (schema incompatible)" });
    }
    // 🔁 Si date ou heure changent → on réactive le rappel
if (req.body.date_rdv !== undefined || req.body.heure_debut !== undefined || req.body.heure_fin !== undefined) {
  sets.push(`sms_rappel_envoye=FALSE`);
}
    params.push(id);
    const q = `UPDATE consultations SET ${sets.join(", ")} WHERE id=$${params.length} RETURNING *`;
    const result = await pool.query(q, params);

    if (result.rows.length === 0) return res.status(404).json({ error: "Consultation introuvable" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/consultations/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM consultations WHERE id=$1", [id]);
    res.json({ message: "Consultation supprimée ✅" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   ==================== ANALYSES ============================
========================================================= */
app.get("/patients/:id/analyses", async (req, res) => {
  const { id } = req.params;
  try {
    const p = await pool.query("SELECT patient_app_id FROM patients WHERE id=$1", [id]);
    const patient_app_id = p.rows?.[0]?.patient_app_id;
    if (!patient_app_id) return res.json([]);
    const result = await pool.query("SELECT * FROM analyses WHERE patient_app_id=$1 ORDER BY id DESC", [patient_app_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/analyses", upload.single("file"), async (req, res) => {
  try {
    const cols = await getTableColumns("analyses");
    const patient_id = req.body.patient_id ? Number(req.body.patient_id) : null;
    const consultation_id = req.body.consultation_id ? Number(req.body.consultation_id) : null;
    const medecin_id = req.body.medecin_id ? Number(req.body.medecin_id) : 1;
    const type_analyse = req.body.type_analyse || req.body.nom || null;
    const remarque =
  req.body?.remarque ||
  req.body?.type_imagerie ||
  req.body?.nom ||
  "Imagerie";
    const date_analyse = req.body.date_analyse || null;

    if (!patient_id) return res.status(400).json({ error: "patient_id obligatoire" });

    const p = await pool.query("SELECT patient_app_id FROM patients WHERE id=$1", [patient_id]);
    const patient_app_id = p.rows?.[0]?.patient_app_id;
    if (!patient_app_id) {
      return res.status(400).json({ error: "Ce patient n’est pas lié à patients_app (patient_app_id manquant)" });
    }

    const insertCols = [];
    const insertVals = [];
    const params = [];

    const push = (col, val) => {
      if (!cols.has(col)) return;
      insertCols.push(col);
      params.push(val);
      insertVals.push("$" + params.length);
    };

    push("patient_app_id", patient_app_id);
    push("medecin_id", medecin_id);
    if (consultation_id) push("consultation_id", consultation_id);
    push("type_analyse", type_analyse);
    if (date_analyse) push("date_analyse", date_analyse);
    push("remarque", remarque);

    if (req.file) {
      const savedPath = `/uploads/${req.file.filename}`;
      const fileCol = firstExisting(cols, ["chemin_fichier", "fichier", "file", "path", "url"]);
      if (fileCol) push(fileCol, savedPath);
    }

    if (insertCols.length === 0) {
      return res.status(400).json({ error: "Aucune colonne compatible trouvée dans analyses" });
    }

    const q = `INSERT INTO analyses (${insertCols.join(",")})
               VALUES (${insertVals.join(",")})
               RETURNING *`;
    const result = await pool.query(q, params);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/analyses/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM analyses WHERE id=$1", [id]);
    res.json({ message: "Analyse supprimée ✅" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   ==================== IMAGERIE ============================
========================================================= */
app.get("/patients/:id/imagerie", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM imagerie WHERE patient_id=$1 ORDER BY id DESC",
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post("/imagerie", upload.single("file"), async (req, res) => {
  try {
    const patient_id = req.body?.patient_id ? Number(req.body.patient_id) : null;
    const type_imagerie = req.body?.type_imagerie || null;
    const remarque = req.body?.remarque || null;

    const fichier = req.file ? `/uploads/${req.file.filename}` : null;

    if (!patient_id) {
      return res.status(400).json({ error: "patient_id obligatoire" });
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


app.delete("/imagerie/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM imagerie WHERE id=$1", [id]);
    res.json({ message: "Imagerie supprimée ✅" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* =========================================================
   ==================== ORDONNANCES ========================
========================================================= */
app.get("/patients/:id/ordonnances", async (req, res) => {
  const { id } = req.params;

  try {
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


app.post("/ordonnances", upload.single("file"), async (req, res) => {
  try {
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

    const result = await pool.query(
      `INSERT INTO ordonnances (patient_id, titre, contenu)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [patient_id, titre, contenu]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.log("ORDONNANCE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   ====================== DOCUMENTS ========================
========================================================= */

app.get("/patients/:id/documents", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM documents WHERE patient_id=$1 ORDER BY id DESC",
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    console.log("GET DOCUMENTS ERROR:", err.message);
    res.status(500).json({ error: err.message });
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

    const result = await pool.query(
      `INSERT INTO documents (patient_id, titre, contenu)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [patient_id, titre, contenu]
    );

    res.json(result.rows[0]);

  } catch (err) {
    console.log("DOCUMENT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
})
/* =========================================================
   ==================== PARAMETRES ==========================
========================================================= */
async function ensureParametresRow() {
  const existing = await pool.query("SELECT id FROM parametres ORDER BY id ASC LIMIT 1");
  if (existing.rows.length > 0) return existing.rows[0].id;

  const ins = await pool.query(
    `INSERT INTO parametres (cabinet_nom, medecin_nom)
     VALUES ($1,$2)
     RETURNING id`,
    ["Cabinet Médical", "Dr. Nom Prénom"]
  );
  return ins.rows[0].id;
}

app.get("/parametres", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM parametres ORDER BY id ASC LIMIT 1");
    if (r.rows.length === 0) return res.json({});
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
async function checkRdvConflict({ date_rdv, heure_debut, heure_fin, excludeId = null }) {
  const q = `
    SELECT id
    FROM rendez_vous
    WHERE date_rdv = $1::date
      AND statut <> 'annule'
      AND ($4::int IS NULL OR id <> $4::int)
      AND (
        heure_debut < COALESCE($3::time, ($2::time + interval '30 min')::time)
        AND COALESCE(heure_fin, (heure_debut + interval '30 min')::time) > $2::time
      )
    LIMIT 1
  `;
  const r = await pool.query(q, [date_rdv, heure_debut, heure_fin || null, excludeId]);
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
  WHERE ($1::date IS NULL OR rv.date_rdv::date = $1::date)
  ORDER BY rv.heure_debut ASC
  `,
  [date]
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
app.get("/rdv/week", async (req, res) => {
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
  WHERE rv.date_rdv >= $1::date
    AND rv.date_rdv < ($1::date + interval '7 day')
  ORDER BY rv.date_rdv ASC, rv.heure_debut ASC, rv.id ASC
  `,
  [start]
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
      heure_debut,
      heure_fin,
      motif,
      statut,
      notes,
    } = req.body;

    if (!date_rdv || !isValidISODate(date_rdv))
      return res.status(400).json({ error: "date_rdv obligatoire (YYYY-MM-DD)" });

    if (!heure_debut || !isValidTime(heure_debut))
      return res.status(400).json({ error: "heure_debut obligatoire (HH:MM)" });

    if (heure_fin && !isValidTime(heure_fin))
      return res.status(400).json({ error: "heure_fin invalide (HH:MM)" });

    if (heure_fin && String(heure_fin) <= String(heure_debut))
      return res.status(400).json({ error: "heure_fin doit être > heure_debut" });

    const hasPatientId = !!patient_id;
    if (!hasPatientId) {
      if (!patient_nom || !patient_telephone) {
        return res.status(400).json({
          error: "patient_nom et patient_telephone obligatoires si patient_id absent",
        });
      }
    }

    const conflict = await checkRdvConflict({
      date_rdv,
      heure_debut,
      heure_fin: heure_fin || null,
      excludeId: null,
    });
    if (conflict) return res.status(409).json({ error: "Créneau déjà occupé (conflit RDV) ❌" });

    const ins = await pool.query(
      `INSERT INTO rendez_vous
       (patient_id, patient_nom, patient_prenom, patient_telephone, source,
        date_rdv, heure_debut, heure_fin, motif, statut, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        hasPatientId ? Number(patient_id) : null,
        patient_nom || null,
        patient_prenom || null,
        patient_telephone || null,
        source || (hasPatientId ? "logiciel" : "mobile"),
        date_rdv,
        heure_debut,
        heure_fin || null,
        motif || null,
        statut || "prevu",
        notes || null,
      ]
    );

    const out = await selectRdvJoinedById(ins.rows[0].id);

    // SMS confirmation (async) + anti-double DB
    setImmediate(async () => {
      try {
        if (!out?.telephone) return;

        const msg = formatRdvSms(out, "create");

        // Si la colonne n'existe pas (ancienne base), on envoie juste le SMS sans flag DB.
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
      return res.status(409).json({ error: "Créneau déjà occupé (conflit RDV) ❌" });
    }
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// UPDATE RDV + SMS modification
// =========================================================
app.put("/rdv/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const cur = await pool.query("SELECT * FROM rendez_vous WHERE id=$1", [id]);
    if (cur.rows.length === 0) return res.status(404).json({ error: "RDV introuvable" });
    const current = cur.rows[0];

    const nextDate = req.body.date_rdv ?? current.date_rdv;
    const nextStart = req.body.heure_debut ?? current.heure_debut;
    const nextEnd = req.body.heure_fin !== undefined ? req.body.heure_fin : current.heure_fin;

    if (req.body.date_rdv && !isValidISODate(req.body.date_rdv))
      return res.status(400).json({ error: "date_rdv invalide (YYYY-MM-DD)" });

    if (req.body.heure_debut && !isValidTime(req.body.heure_debut))
      return res.status(400).json({ error: "heure_debut invalide (HH:MM)" });

    if (req.body.heure_fin && !isValidTime(req.body.heure_fin))
      return res.status(400).json({ error: "heure_fin invalide (HH:MM)" });

    if (nextEnd && String(nextEnd) <= String(nextStart))
      return res.status(400).json({ error: "heure_fin doit être > heure_debut" });

    const conflict = await checkRdvConflict({
      date_rdv: nextDate,
      heure_debut: nextStart,
      heure_fin: nextEnd || null,
      excludeId: Number(id),
    });
    if (conflict) return res.status(409).json({ error: "Créneau déjà occupé (conflit RDV) ❌" });

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
    if (sets.length === 0) return res.status(400).json({ error: "Aucun champ à modifier" });

    sets.push(`updated_at=NOW()`);
    params.push(id);

    const q = `UPDATE rendez_vous SET ${sets.join(", ")} WHERE id=$${params.length} RETURNING id`;
    const r = await pool.query(q, params);

    const out = await selectRdvJoinedById(r.rows[0].id);

    // SMS update (async)
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
app.delete("/rdv/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query("DELETE FROM rendez_vous WHERE id=$1 RETURNING id", [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "RDV introuvable" });
    res.json({ message: "RDV supprimé ✅" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// AUDIT RDV (UNIQUE route)
// =========================================================
app.get("/rdv/:id/audit", async (req, res) => {
  try {
    const { id } = req.params;

    const exists = await pool.query("SELECT id FROM rendez_vous WHERE id=$1", [id]);
    if (exists.rows.length === 0) return res.status(404).json({ error: "RDV introuvable" });

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
          AND start_ts <  NOW() + interval '2 hours 2 minutes'
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

const bcrypt = require("bcrypt");

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
    res.status(500).json({ error: err.message });
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

// ==============================
// GET RDV DEMANDES (PC)
// ==============================
app.get("/rdv-demandes", authRequired, async (req, res) => {
  try {
    const cabinetId = req.user?.cabinet_id || req.user?.cabinetId || null;

    const { rows } = await pool.query(
      `
      SELECT *
      FROM rdv_demandes
      WHERE ($1::int IS NULL OR cabinet_id = $1::int)
      ORDER BY created_at DESC
      `,
      [cabinetId]
    );

    res.json(rows);
  } catch (err) {
    console.log("❌ /rdv-demandes error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
/* ================= DASHBOARD ================= */

app.get("/dashboard/stats", async (req, res) => {
  try {
    const patients = await pool.query("SELECT COUNT(*) FROM patients");
    const consultations = await pool.query("SELECT COUNT(*) FROM consultations");
    const rdv = await pool.query("SELECT COUNT(*) FROM rendez_vous");

    res.json({
      patients: Number(patients.rows[0].count || 0),
      consultations: Number(consultations.rows[0].count || 0),
      rendezvous: Number(rdv.rows[0].count || 0),
    });
  } catch (err) {
    console.log("DASHBOARD STATS ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
      console.log(`Serveur PRO lancé sur le port ${PORT} 🚀`);
});
