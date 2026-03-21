const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_TEAMS = 8;

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "1234";

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERRO: variáveis do Supabase não encontradas.");
  console.error("SUPABASE_URL:", process.env.SUPABASE_URL ? "OK" : "FALTANDO");
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY:",
    process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "FALTANDO"
  );
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
  const { count, error } = await supabase
    .from("teams")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved");

  if (error) throw error;
  return count || 0;
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
    console.error("ERRO EM /api/status:", err);
    res.status(500).json({
      success: false,
      message: "Erro ao buscar status."
    });
  }
});

app.get("/api/team-check", async (req, res) => {
  try {
    const teamName = String(req.query.teamName || "").trim();

    if (!teamName) {
      return res.json({
        success: true,
        exists: false
      });
    }

    const { data, error } = await supabase
      .from("teams")
      .select("id")
      .ilike("team_name", teamName);

    if (error) throw error;

    res.json({
      success: true,
      exists: Array.isArray(data) && data.length > 0
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

    const cleanTeam = teamName.trim();
    const cleanDiscord = discord.trim();
    const cleanPhone = phone.trim();
    const cleanP1 = playerOne.trim();
    const cleanP2 = playerTwo.trim();

    const { data: dupData, error: dupError } = await supabase
      .from("teams")
      .select("id")
      .ilike("team_name", cleanTeam);

    if (dupError) throw dupError;

    if (dupData && dupData.length > 0) {
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

    const { error } = await supabase.from("teams").insert([
      {
        team_name: cleanTeam,
        discord: cleanDiscord,
        phone: cleanPhone,
        player_one: cleanP1,
        player_two: cleanP2,
        status: "pending"
      }
    ]);

    if (error) throw error;

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
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const approved = await getApprovedCount();

    return res.json({
      success: true,
      approvedTeams: approved,
      remainingSlots: Math.max(0, MAX_TEAMS - approved),
      teams: data || []
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

      const { data: currentTeam, error: currentError } = await supabase
        .from("teams")
        .select("status")
        .eq("id", id)
        .single();

      if (currentError) throw currentError;

      const alreadyApproved = currentTeam.status === "approved";

      if (!alreadyApproved && approved >= MAX_TEAMS) {
        return res.status(400).json({
          success: false,
          message: "Não há mais vagas disponíveis."
        });
      }
    }

    const { error } = await supabase
      .from("teams")
      .update({ status })
      .eq("id", id);

    if (error) throw error;

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