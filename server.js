const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_TEAMS = 8;

const ADMIN_USER = process.env.ADMIN_USER || "soudafafa";
const ADMIN_PASS = process.env.ADMIN_PASS || "soudafafa123";

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on("error", (err) => {
  console.error("ERRO NO POOL POSTGRES:", err);
});

function requireAdmin(req, res, next) {
  const user = req.headers["x-admin-user"];
  const pass = req.headers["x-admin-pass"];

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    return next();
  }

  return res.status(401).json({
    success: false,
    message: "Acesso negado."
  });
}

async function getApprovedCount() {
  const result = await pool.query(
    "SELECT COUNT(*)::int AS total FROM teams WHERE status = 'approved'"
  );
  return result.rows[0].total;
}

app.get("/api/status", async (req, res) => {
  try {
    const approved = await getApprovedCount();

    res.json({
      success: true,
      approvedTeams: approved,
      remainingSlots: Math.max(0, MAX_TEAMS - approved),
      maxTeams: MAX_TEAMS
    });
  } catch (err) {
    console.error("ERRO REAL EM /api/status:", err);
    res.status(500).json({
      success: false,
      message: "Erro ao buscar status."
    });
  }
});

app.get("/api/team-check", async (req, res) => {
  try {
    const teamName = String(req.query.teamName || "").trim().toLowerCase();

    if (!teamName) {
      return res.json({
        success: true,
        exists: false
      });
    }

    const result = await pool.query(
      "SELECT COUNT(*)::int AS total FROM teams WHERE LOWER(team_name) = $1",
      [teamName]
    );

    res.json({
      success: true,
      exists: result.rows[0].total > 0
    });
  } catch (err) {
    console.error("ERRO EM /api/team-check:", err);
    res.status(500).json({
      success: false,
      exists: false
    });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { teamName, discord, phone, playerOne, playerTwo } = req.body || {};

    if (!teamName || !discord || !phone || !playerOne || !playerTwo) {
      return res.status(400).json({
        success: false,
        message: "Preencha tudo."
      });
    }

    const duplicate = await pool.query(
      "SELECT COUNT(*)::int AS total FROM teams WHERE LOWER(team_name) = $1",
      [teamName.trim().toLowerCase()]
    );

    if (duplicate.rows[0].total > 0) {
      return res.status(400).json({
        success: false,
        message: "Nome já existe."
      });
    }

    const approved = await getApprovedCount();

    if (approved >= MAX_TEAMS) {
      return res.status(400).json({
        success: false,
        message: "Sem vagas."
      });
    }

    await pool.query(
      `INSERT INTO teams (
        team_name, discord, phone, player_one, player_two, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        teamName.trim(),
        discord.trim(),
        phone.trim(),
        playerOne.trim(),
        playerTwo.trim(),
        "pending"
      ]
    );

    return res.json({
      success: true,
      message: "Equipe registrada com sucesso."
    });
  } catch (err) {
    console.error("ERRO EM /api/register:", err);
    return res.status(500).json({
      success: false,
      message: "Não foi possível concluir a inscrição."
    });
  }
});

app.post("/api/admin/login", (req, res) => {
  const { user, pass } = req.body || {};

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    return res.json({ success: true });
  }

  return res.status(401).json({
    success: false,
    message: "Falha no login."
  });
});

app.get("/api/admin/registrations", requireAdmin, async (req, res) => {
  try {
    const teamsResult = await pool.query(
      "SELECT * FROM teams ORDER BY created_at DESC"
    );

    const approved = await getApprovedCount();

    return res.json({
      success: true,
      approvedTeams: approved,
      remainingSlots: Math.max(0, MAX_TEAMS - approved),
      teams: teamsResult.rows
    });
  } catch (err) {
    console.error("ERRO EM /api/admin/registrations:", err);
    return res.status(500).json({
      success: false,
      message: "Erro ao carregar inscrições."
    });
  }
});

app.post("/api/admin/update-status", requireAdmin, async (req, res) => {
  try {
    const { id, status } = req.body || {};

    if (!id || !["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Dados inválidos."
      });
    }

    if (status === "approved") {
      const approved = await getApprovedCount();

      const currentTeam = await pool.query(
        "SELECT status FROM teams WHERE id = $1",
        [id]
      );

      if (currentTeam.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Equipe não encontrada."
        });
      }

      const alreadyApproved = currentTeam.rows[0].status === "approved";

      if (!alreadyApproved && approved >= MAX_TEAMS) {
        return res.status(400).json({
          success: false,
          message: "Não há mais vagas disponíveis."
        });
      }
    }

    await pool.query(
      "UPDATE teams SET status = $1 WHERE id = $2",
      [status, id]
    );

    return res.json({
      success: true,
      message: "Status atualizado."
    });
  } catch (err) {
    console.error("ERRO EM /api/admin/update-status:", err);
    return res.status(500).json({
      success: false,
      message: "Erro ao atualizar."
    });
  }
});

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});