const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;
const MAX_TEAMS = 8;
const ADMIN_USER = process.env.ADMIN_USER || "soudafafa";
const ADMIN_PASS = process.env.ADMIN_PASS || "soudafafa123";
const publicPath = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "registrations.json");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify({ teams: [] }, null, 2));
app.use(express.json());
app.use(express.static(publicPath));
function readData(){ try { return JSON.parse(fs.readFileSync(dataFile, "utf-8")); } catch { return { teams: [] }; } }
function writeData(d){ fs.writeFileSync(dataFile, JSON.stringify(d, null, 2)); }
function normalize(v){ return String(v || "").trim().toLowerCase(); }
function approvedCount(d){ return d.teams.filter(t => t.status === "approved").length; }
function remainingSlots(d){ return Math.max(0, MAX_TEAMS - approvedCount(d)); }
function requireAdmin(req,res,next){ const u=req.headers["x-admin-user"]; const p=req.headers["x-admin-pass"]; if(u===ADMIN_USER&&p===ADMIN_PASS) return next(); return res.status(401).json({success:false,message:"Acesso negado."}); }
app.get("/api/status",(req,res)=>{ const d=readData(); res.json({success:true,remainingSlots:remainingSlots(d),approvedTeams:approvedCount(d),maxTeams:MAX_TEAMS}); });
app.get("/api/team-check",(req,res)=>{ const d=readData(); const exists=d.teams.some(t=>normalize(t.teamName)===normalize(req.query.teamName)); res.json({success:true,exists}); });
app.post("/api/register",(req,res)=>{ const {teamName,discord,phone,playerOne,playerTwo}=req.body||{}; if(!teamName||!discord||!phone||!playerOne||!playerTwo) return res.status(400).json({success:false,message:"Preencha todos os campos obrigatórios."}); const d=readData(); if(remainingSlots(d)<=0) return res.status(400).json({success:false,message:"As vagas já foram preenchidas."}); if(d.teams.some(t=>normalize(t.teamName)===normalize(teamName))) return res.status(400).json({success:false,message:"Esse nome de equipe já está em uso."}); const team={id:Date.now().toString(),teamName:teamName.trim(),discord:discord.trim(),phone:phone.trim(),playerOne:playerOne.trim(),playerTwo:playerTwo.trim(),status:"pending",createdAt:new Date().toISOString()}; d.teams.push(team); writeData(d); res.json({success:true,team,message:"Equipe enviada para análise."}); });
app.post("/api/admin/login",(req,res)=>{ const {user,pass}=req.body||{}; if(user===ADMIN_USER&&pass===ADMIN_PASS) return res.json({success:true}); return res.status(401).json({success:false,message:"Usuário ou senha inválidos."}); });
app.get("/api/admin/registrations",requireAdmin,(req,res)=>{ const d=readData(); res.json({success:true,approvedTeams:approvedCount(d),remainingSlots:remainingSlots(d),teams:d.teams.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))}); });
app.post("/api/admin/update-status",requireAdmin,(req,res)=>{ const {id,status}=req.body||{}; const d=readData(); const t=d.teams.find(x=>x.id===id); if(!t) return res.status(404).json({success:false,message:"Equipe não encontrada."}); if(!["pending","approved","rejected"].includes(status)) return res.status(400).json({success:false,message:"Status inválido."}); if(status==="approved"&&t.status!=="approved"&&remainingSlots(d)<=0) return res.status(400).json({success:false,message:"Não há mais vagas disponíveis."}); t.status=status; writeData(d); res.json({success:true,message:"Status atualizado."}); });
app.listen(PORT,()=>console.log("Servidor rodando em http://localhost:"+PORT));