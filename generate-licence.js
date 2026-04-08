const { Pool } = require("pg");

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_zn6QMp0sRNCg@ep-cool-rice-agnl3lhb-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  ssl: { rejectUnauthorized: false },
});

function generateLicenceKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  const part = (len = 4) => {
    let out = "";
    for (let i = 0; i < len; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  };

  return `MATI-CAB-${new Date().getFullYear()}-${part(4)}-${part(4)}`;
}

async function main() {
  try {
    const cabinetId = 1;
    const nomLicence = "Licence Cabinet 3 postes";
    const nbPostesMax = 3;
    const versionAutorisee = "0.1.0";

    let cleLicence = "";
    let exists = true;

    while (exists) {
      cleLicence = generateLicenceKey();

      const check = await pool.query(
        "SELECT id FROM licences WHERE cle_licence = $1 LIMIT 1",
        [cleLicence]
      );

      exists = check.rows.length > 0;
    }

    const result = await pool.query(
      `
      INSERT INTO licences (
        cabinet_id,
        cle_licence,
        nom_licence,
        nb_postes_max,
        version_autorisee,
        active
      )
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING *
      `,
      [cabinetId, cleLicence, nomLicence, nbPostesMax, versionAutorisee]
    );

    console.log("Licence créée avec succès :");
    console.log(result.rows[0]);
  } catch (err) {
    console.error("Erreur génération licence :", err.message);
  } finally {
    await pool.end();
  }
}

main();
