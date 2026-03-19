const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const MAX_TEAMS = 8;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// 🔥 CONEXÃO COM SUPABASE
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// =============================
// STATUS (VAGAS)
// =============================
app.get("/api/status", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*)::int as total FROM teams WHERE status = 'approved'"
    );

    const approved = result.rows[0].total;
    const remaining = MAX_TEAMS - approved;

    res.json({
      success: true,
      approvedTeams: approved,
      remainingSlots: remaining < 0 ? 0 : remaining,
      maxTeams: MAX_TEAMS
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// =============================
// VERIFICAR NOME DUPLICADO
// =============================
app.get("/api/team-check", async (req, res) => {
  try {
    const name = req.query.teamName.toLowerCase();

    const result = await pool.query(
      "SELECT COUNT(*)::int as total FROM teams WHERE LOWER(team_name) = $1",
      [name]
    );

    res.json({
      exists: result.rows[0].total > 0
    });
  } catch {
    res.status(500).json({ exists: false });
  }
});

// =============================
// REGISTRAR EQUIPE
// =============================
app.post("/api/register", async (req, res) => {
  try {
    const { teamName, discord, phone, playerOne, playerTwo } = req.body;

    if (!teamName || !discord || !phone || !playerOne || !playerTwo) {
      return res.json({ success: false, message: "Preencha tudo" });
    }

    // verificar duplicado
    const dup = await pool.query(
      "SELECT COUNT(*)::int as total FROM teams WHERE LOWER(team_name) = $1",
      [teamName.toLowerCase()]
    );

    if (dup.rows[0].total > 0) {
      return res.json({ success: false, message: "Nome já existe" });
    }

    // verificar vagas
    const count = await pool.query(
      "SELECT COUNT(*)::int as total FROM teams WHERE status = 'approved'"
    );

    if (count.rows[0].total >= MAX_TEAMS) {
      return res.json({ success: false, message: "Sem vagas" });
    }

    await pool.query(
      `INSERT INTO teams (team_name, discord, phone, player_one, player_two, status)
       VALUES ($1,$2,$3,$4,$5,'pending')`,
      [teamName, discord, phone, playerOne, playerTwo]
    );

    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

// =============================
// ADMIN LOGIN SIMPLES
// =============================
app.post("/api/admin/login", (req, res) => {
  const { user, pass } = req.body;

  if (user === "admin" && pass === "1234") {
    return res.json({ success: true });
  }

  res.json({ success: false });
});

// =============================
// LISTAR EQUIPES
// =============================
app.get("/api/admin/teams", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM teams ORDER BY created_at DESC"
    );

    res.json(result.rows);
  } catch {
    res.status(500).json([]);
  }
});

// =============================
// APROVAR / REJEITAR
// =============================
app.post("/api/admin/update", async (req, res) => {
  try {
    const { id, status } = req.body;

    await pool.query(
      "UPDATE teams SET status = $1 WHERE id = $2",
      [status, id]
    );

    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

// =============================
app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});