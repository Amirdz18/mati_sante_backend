const { Pool } = require("pg")

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})


async function importMedicaments() {

  const res = await fetch("https://openmedic-api.herokuapp.com/medicaments")

  const data = await res.json()

  for (const med of data) {

    await pool.query(
      "INSERT INTO medicaments (nom) VALUES ($1) ON CONFLICT DO NOTHING",
      [med.nom]
    )

  }

  console.log("Import terminé")

  process.exit()
}

importMedicaments()
