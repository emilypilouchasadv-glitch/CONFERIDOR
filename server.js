// Conferidor de Documentos — servidor independente com login, cadastro e painel administrativo.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const Anthropic = require("@anthropic-ai/sdk");

// Carrega .env simples (sem dependência extra)
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const PORT = +process.env.PORT || 3000;
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const DB_FILE = path.join(DATA_DIR, "db.json");
const LIMITE_DIA_PADRAO = +(process.env.LIMITE_DIA_PADRAO ?? 20);
const LIMITE_TOTAL_PADRAO = +(process.env.LIMITE_TOTAL_PADRAO ?? 0);
const PLANOS = { 3: "3 dias", 7: "7 dias", 15: "15 dias", 30: "30 dias", 365: "1 ano" };
const DIA = 86400000;

// ---------- Banco de dados (arquivo JSON) ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { users: [], sessions: {}, logs: [] };
if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
db.users ||= []; db.sessions ||= {}; db.logs ||= [];
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, DB_FILE);
  }, 50);
}
function log(userId, acao, detalhe = "") {
  db.logs.push({ em: new Date().toISOString(), userId, acao, detalhe });
  if (db.logs.length > 5000) db.logs = db.logs.slice(-5000);
  save();
}
const hoje = () => new Date().toISOString().slice(0, 10);
const novoId = () => crypto.randomBytes(8).toString("hex");
const normEmail = (e) => String(e || "").trim().toLowerCase();

// Admin inicial
(function criarAdmin() {
  const email = normEmail(process.env.ADMIN_EMAIL);
  const senha = process.env.ADMIN_PASSWORD;
  if (!email || !senha) {
    if (!db.users.some((u) => u.role === "admin"))
      console.warn("ATENÇÃO: defina ADMIN_EMAIL e ADMIN_PASSWORD para criar o administrador.");
    return;
  }
  let u = db.users.find((x) => x.email === email);
  if (!u) {
    u = { id: novoId(), nome: "Administrador", email, telefone: "", criadoEm: new Date().toISOString() };
    db.users.push(u);
    console.log("Administrador criado:", email);
  }
  Object.assign(u, { role: "admin", status: "ativo", expiraEm: null, limiteDia: 0, limiteTotal: 0 });
  u.hash = bcrypt.hashSync(senha, 10);
  u.usoTotal ||= 0; u.usoDia ||= { data: hoje(), qtd: 0 };
  save();
})();

// Situação de acesso de um usuário
function situacao(u) {
  if (u.role === "admin") return { ok: true, codigo: "ativo", msg: "Administrador" };
  if (u.status === "pendente") return { ok: false, codigo: "pendente", msg: "Seu cadastro está aguardando liberação do administrador." };
  if (u.status === "bloqueado") return { ok: false, codigo: "bloqueado", msg: "Seu acesso está desabilitado. Fale com o administrador." };
  if (!u.expiraEm || Date.parse(u.expiraEm) < Date.now())
    return { ok: false, codigo: "expirado", msg: "Seu período de acesso terminou. Fale com o administrador para renovar." };
  return { ok: true, codigo: "ativo", msg: "Ativo" };
}
function usoHoje(u) {
  if (!u.usoDia || u.usoDia.data !== hoje()) u.usoDia = { data: hoje(), qtd: 0 };
  return u.usoDia.qtd;
}
function publico(u) {
  const s = situacao(u);
  return {
    id: u.id, nome: u.nome, email: u.email, telefone: u.telefone, role: u.role, status: u.status,
    situacao: s.codigo, expiraEm: u.expiraEm, criadoEm: u.criadoEm, ultimoAcesso: u.ultimoAcesso || null,
    limiteDia: u.limiteDia, limiteTotal: u.limiteTotal, usoHoje: usoHoje(u), usoTotal: u.usoTotal || 0,
    plano: u.plano || null, observacao: u.observacao || "",
  };
}

// ---------- App ----------
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "60mb" }));
app.use(cookieParser());
app.use((req, res, next) => { res.setHeader("X-Frame-Options", "SAMEORIGIN"); next(); });

const SESS_DIAS = 7;
function criarSessao(res, req, u) {
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions[token] = { userId: u.id, expira: Date.now() + SESS_DIAS * DIA };
  u.ultimoAcesso = new Date().toISOString();
  save();
  res.cookie("sid", token, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: SESS_DIAS * DIA });
}
function usuarioDa(req) {
  const s = db.sessions[req.cookies.sid];
  if (!s) return null;
  if (s.expira < Date.now()) { delete db.sessions[req.cookies.sid]; save(); return null; }
  return db.users.find((u) => u.id === s.userId) || null;
}
const exigeLogin = (api) => (req, res, next) => {
  const u = usuarioDa(req);
  if (!u) return api ? res.status(401).json({ erro: "Faça login novamente." }) : res.redirect("/login");
  req.user = u; next();
};
const exigeAdmin = (req, res, next) => {
  const u = usuarioDa(req);
  if (!u || u.role !== "admin") return res.status(403).json({ erro: "Acesso restrito ao administrador." });
  req.user = u; next();
};

// Proteção simples contra tentativas repetidas de login
const tentativas = new Map();
function bloqueadoPorTentativas(chave) {
  const t = tentativas.get(chave);
  return t && t.n >= 8 && Date.now() - t.em < 15 * 60000;
}
function registrarFalha(chave) {
  const t = tentativas.get(chave) || { n: 0, em: Date.now() };
  if (Date.now() - t.em > 15 * 60000) { t.n = 0; t.em = Date.now(); }
  t.n++; tentativas.set(chave, t);
}

// ---------- Páginas ----------
const pub = path.join(__dirname, "public");
app.get("/", (req, res) => res.redirect(usuarioDa(req) ? "/app" : "/login"));
app.get("/login", (req, res) => res.sendFile(path.join(pub, "login.html")));
app.get("/admin", (req, res) => {
  const u = usuarioDa(req);
  if (!u) return res.redirect("/login");
  if (u.role !== "admin") return res.redirect("/app");
  res.sendFile(path.join(pub, "admin.html"));
});
app.get("/estilo.css", (req, res) => res.sendFile(path.join(pub, "estilo.css")));
app.get("/shim.js", (req, res) => res.sendFile(path.join(pub, "shim.js")));

const ORIGINAL = fs.readFileSync(path.join(__dirname, "views", "conferidor-original.html"), "utf8");
const CONFERIDOR = ORIGINAL.replace(
  /<head><meta charset="utf-8">/i,
  '<head><meta charset="utf-8"><script src="/shim.js"></script>'
);
app.get("/app", exigeLogin(false), (req, res) => {
  const s = situacao(req.user);
  if (!s.ok) return res.sendFile(path.join(pub, "sem-acesso.html"));
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(CONFERIDOR);
});

// ---------- API: autenticação ----------
app.post("/api/cadastro", (req, res) => {
  const nome = String(req.body.nome || "").trim().slice(0, 120);
  const email = normEmail(req.body.email);
  const telefone = String(req.body.telefone || "").trim().slice(0, 40);
  const senha = String(req.body.senha || "");
  if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ erro: "Informe nome e e-mail válidos." });
  if (senha.length < 6) return res.status(400).json({ erro: "A senha precisa ter pelo menos 6 caracteres." });
  if (db.users.some((u) => u.email === email)) return res.status(400).json({ erro: "Este e-mail já está cadastrado." });
  const u = {
    id: novoId(), nome, email, telefone, hash: bcrypt.hashSync(senha, 10), role: "user", status: "pendente",
    expiraEm: null, plano: null, limiteDia: LIMITE_DIA_PADRAO, limiteTotal: LIMITE_TOTAL_PADRAO,
    usoTotal: 0, usoDia: { data: hoje(), qtd: 0 }, criadoEm: new Date().toISOString(),
  };
  db.users.push(u); log(u.id, "cadastro", email); save();
  criarSessao(res, req, u);
  res.json({ ok: true });
});

app.post("/api/login", (req, res) => {
  const email = normEmail(req.body.email);
  const chave = req.ip + "|" + email;
  if (bloqueadoPorTentativas(chave)) return res.status(429).json({ erro: "Muitas tentativas. Aguarde 15 minutos." });
  const u = db.users.find((x) => x.email === email);
  if (!u || !bcrypt.compareSync(String(req.body.senha || ""), u.hash)) {
    registrarFalha(chave);
    return res.status(401).json({ erro: "E-mail ou senha incorretos." });
  }
  tentativas.delete(chave);
  criarSessao(res, req, u); log(u.id, "login");
  res.json({ ok: true, admin: u.role === "admin" });
});

app.post("/api/logout", (req, res) => {
  delete db.sessions[req.cookies.sid]; save();
  res.clearCookie("sid"); res.json({ ok: true });
});

app.get("/api/eu", exigeLogin(true), (req, res) => {
  const s = situacao(req.user);
  res.json({ ...publico(req.user), acessoOk: s.ok, mensagem: s.msg });
});

app.post("/api/trocar-senha", exigeLogin(true), (req, res) => {
  const { atual, nova } = req.body || {};
  if (!bcrypt.compareSync(String(atual || ""), req.user.hash)) return res.status(400).json({ erro: "Senha atual incorreta." });
  if (String(nova || "").length < 6) return res.status(400).json({ erro: "A nova senha precisa ter pelo menos 6 caracteres." });
  req.user.hash = bcrypt.hashSync(String(nova), 10); save();
  res.json({ ok: true });
});

// ---------- API: análise com Claude ----------
const anthropic = new Anthropic(); // usa ANTHROPIC_API_KEY
const MAX_IMAGENS = 6;

function extrairJSON(texto) {
  const t = texto.replace(/```(?:json)?/gi, "").trim();
  try { return JSON.parse(t); } catch {}
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i >= 0 && j > i) return JSON.parse(t.slice(i, j + 1));
  throw new Error("A resposta da análise não veio no formato esperado.");
}

app.post("/api/analisar", exigeLogin(true), async (req, res) => {
  const u = req.user;
  const s = situacao(u);
  if (!s.ok) return res.status(403).json({ erro: s.msg, codigo: s.codigo });
  if (u.role !== "admin") {
    if (u.limiteDia > 0 && usoHoje(u) >= u.limiteDia)
      return res.status(403).json({ erro: `Você atingiu o limite de ${u.limiteDia} análises por dia. Tente novamente amanhã.`, codigo: "limite" });
    if (u.limiteTotal > 0 && (u.usoTotal || 0) >= u.limiteTotal)
      return res.status(403).json({ erro: `Você atingiu o limite total de ${u.limiteTotal} análises. Fale com o administrador.`, codigo: "limite" });
  }
  const prompt = String(req.body.prompt || "");
  const imagens = Array.isArray(req.body.images) ? req.body.images.slice(0, MAX_IMAGENS) : [];
  if (!prompt) return res.status(400).json({ erro: "Pedido vazio." });

  // Reserva o uso antes da chamada (evita ultrapassar o limite com cliques simultâneos)
  usoHoje(u); u.usoDia.qtd++; u.usoTotal = (u.usoTotal || 0) + 1; save();
  const estornar = () => { u.usoDia.qtd = Math.max(0, u.usoDia.qtd - 1); u.usoTotal = Math.max(0, u.usoTotal - 1); save(); };

  try {
    const content = [];
    for (const im of imagens) {
      const media = /^image\/(jpeg|png|gif|webp)$/.test(im.type) ? im.type : "image/jpeg";
      content.push({ type: "image", source: { type: "base64", media_type: media, data: String(im.data || "") } });
    }
    content.push({ type: "text", text: prompt });
    const base = {
      model: MODEL,
      max_tokens: 16000,
      system: "Responda sempre em português do Brasil e somente com um objeto JSON válido, sem texto antes ou depois.",
      messages: [{ role: "user", content }],
    };
    let resp;
    try {
      // Fallback automático no servidor caso o modelo recuse o pedido
      resp = await anthropic.beta.messages.create({ ...base, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    } catch (e) {
      if (!(e instanceof Anthropic.BadRequestError)) throw e;
      resp = await anthropic.messages.create(base); // modelo sem suporte a fallback
    }
    if (resp.stop_reason === "refusal") throw new Error("A análise foi recusada para este documento.");
    const texto = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const json = extrairJSON(texto);
    log(u.id, "analise", `${imagens.length} imagem(ns)`);
    res.json({ ok: true, resultado: json });
  } catch (e) {
    estornar();
    console.error("Erro na análise:", e?.status, e?.message);
    const msg = e instanceof Anthropic.APIError
      ? (e.status === 429 ? "Serviço de análise ocupado. Tente novamente em instantes." : "Falha no serviço de análise. Tente novamente.")
      : e.message || "Falha na análise.";
    res.status(502).json({ erro: msg });
  }
});

// ---------- API: administrador ----------
app.get("/api/admin/usuarios", exigeAdmin, (req, res) => {
  res.json({ usuarios: db.users.map(publico).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)), planos: PLANOS });
});

app.post("/api/admin/usuarios/:id", exigeAdmin, (req, res) => {
  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ erro: "Usuário não encontrado." });
  const b = req.body || {};
  const acao = b.acao;
  if (u.role === "admin" && ["desabilitar", "excluir"].includes(acao) && u.id === req.user.id)
    return res.status(400).json({ erro: "Você não pode desabilitar ou excluir a sua própria conta." });

  if (acao === "liberar") {
    const dias = +b.dias;
    if (!PLANOS[dias]) return res.status(400).json({ erro: "Período inválido." });
    // Se ainda estiver ativo, soma ao prazo atual; senão conta a partir de agora
    const base = b.somar && u.expiraEm && Date.parse(u.expiraEm) > Date.now() ? Date.parse(u.expiraEm) : Date.now();
    u.expiraEm = new Date(base + dias * DIA).toISOString();
    u.status = "ativo"; u.plano = PLANOS[dias];
    log(u.id, "liberado", `${PLANOS[dias]} por ${req.user.email}`);
  } else if (acao === "desabilitar") {
    u.status = "bloqueado"; log(u.id, "desabilitado", req.user.email);
  } else if (acao === "habilitar") {
    u.status = "ativo"; log(u.id, "habilitado", req.user.email);
  } else if (acao === "limites") {
    u.limiteDia = Math.max(0, parseInt(b.limiteDia) || 0);
    u.limiteTotal = Math.max(0, parseInt(b.limiteTotal) || 0);
    if (b.observacao !== undefined) u.observacao = String(b.observacao).slice(0, 500);
    if (b.expiraEm !== undefined) u.expiraEm = b.expiraEm ? new Date(b.expiraEm + "T23:59:59").toISOString() : null;
  } else if (acao === "zerarUso") {
    u.usoTotal = 0; u.usoDia = { data: hoje(), qtd: 0 };
  } else if (acao === "novaSenha") {
    const nova = String(b.senha || "");
    if (nova.length < 6) return res.status(400).json({ erro: "A senha precisa ter pelo menos 6 caracteres." });
    u.hash = bcrypt.hashSync(nova, 10);
    for (const [k, s] of Object.entries(db.sessions)) if (s.userId === u.id) delete db.sessions[k];
  } else if (acao === "tornarAdmin") {
    u.role = b.admin ? "admin" : "user";
  } else if (acao === "excluir") {
    db.users = db.users.filter((x) => x.id !== u.id);
    for (const [k, s] of Object.entries(db.sessions)) if (s.userId === u.id) delete db.sessions[k];
    log(u.id, "excluido", `${u.email} por ${req.user.email}`); save();
    return res.json({ ok: true });
  } else return res.status(400).json({ erro: "Ação inválida." });
  save();
  res.json({ ok: true, usuario: publico(u) });
});

app.post("/api/admin/criar", exigeAdmin, (req, res) => {
  const nome = String(req.body.nome || "").trim();
  const email = normEmail(req.body.email);
  const senha = String(req.body.senha || "");
  const dias = +req.body.dias;
  if (!nome || !email || senha.length < 6) return res.status(400).json({ erro: "Preencha nome, e-mail e senha (mín. 6)." });
  if (db.users.some((u) => u.email === email)) return res.status(400).json({ erro: "E-mail já cadastrado." });
  const u = {
    id: novoId(), nome, email, telefone: String(req.body.telefone || ""), hash: bcrypt.hashSync(senha, 10), role: "user",
    status: PLANOS[dias] ? "ativo" : "pendente", plano: PLANOS[dias] || null,
    expiraEm: PLANOS[dias] ? new Date(Date.now() + dias * DIA).toISOString() : null,
    limiteDia: LIMITE_DIA_PADRAO, limiteTotal: LIMITE_TOTAL_PADRAO, usoTotal: 0, usoDia: { data: hoje(), qtd: 0 },
    criadoEm: new Date().toISOString(),
  };
  db.users.push(u); log(u.id, "criado pelo admin", req.user.email); save();
  res.json({ ok: true });
});

app.get("/api/admin/historico", exigeAdmin, (req, res) => {
  const nomes = Object.fromEntries(db.users.map((u) => [u.id, u.email]));
  res.json({ logs: db.logs.slice(-300).reverse().map((l) => ({ ...l, email: nomes[l.userId] || "(excluído)" })) });
});

app.get("/api/admin/exportar.csv", exigeAdmin, (req, res) => {
  const cols = ["nome", "email", "telefone", "situacao", "plano", "expiraEm", "limiteDia", "limiteTotal", "usoHoje", "usoTotal", "criadoEm", "ultimoAcesso"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const linhas = [cols.join(";"), ...db.users.map(publico).map((u) => cols.map((c) => esc(u[c])).join(";"))];
  res.setHeader("Content-Disposition", 'attachment; filename="usuarios.csv"');
  res.type("text/csv; charset=utf-8").send("﻿" + linhas.join("\n"));
});

app.listen(PORT, () => console.log(`Conferidor rodando em http://localhost:${PORT}  (modelo: ${MODEL})`));
