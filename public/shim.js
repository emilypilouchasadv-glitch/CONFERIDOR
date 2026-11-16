// Substitui o recurso de análise do Claude.ai pela API do próprio servidor.
(function () {
  function blobParaBase64(b) {
    return new Promise(function (ok, erro) {
      var r = new FileReader();
      r.onload = function () { ok({ type: b.type || "image/jpeg", data: String(r.result).split(",")[1] }); };
      r.onerror = erro; r.readAsDataURL(b);
    });
  }
  var sample = {
    limits: async function () { return { images: { maxCount: 6 } }; },
    json: async function (prompt, opts) {
      var imgs = await Promise.all(((opts && opts.images) || []).map(blobParaBase64));
      var r = await fetch("/api/analisar", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ tipo: prompt && prompt.tipo, ctx: prompt && prompt.ctx, images: imgs })
      });
      var d = await r.json().catch(function () { return {}; });
      if (r.status === 401) { location.href = "/login"; throw new Error("Sessão expirada."); }
      if (d.codigo === "consentimento") { location.href = "/consentimento"; throw new Error(d.erro); }
      atualizarBarra();
      if (!r.ok) throw new Error(d.erro || "Falha na análise.");
      return d.resultado;
    }
  };
  window.claude = { use: async function (n) { return n === "sample" ? sample : null; } };

  async function atualizarBarra() {
    var el = document.getElementById("cd-barra"); if (!el) return;
    try {
      var r = await fetch("/api/eu", { credentials: "same-origin" });
      if (r.status === 401) { location.href = "/login"; return; }
      var u = await r.json();
      var partes = ["<b>" + esc(u.nome) + "</b>"];
      if (u.role !== "admin") {
        if (u.expiraEm) partes.push("acesso até " + new Date(u.expiraEm).toLocaleDateString("pt-BR"));
        partes.push("análises hoje: " + u.usoHoje + (u.limiteDia ? "/" + u.limiteDia : ""));
        if (u.limiteTotal) partes.push("total: " + u.usoTotal + "/" + u.limiteTotal);
      }
      el.querySelector(".cd-info").innerHTML = partes.join(" · ");
      el.querySelector(".cd-adm").hidden = u.role !== "admin";
    } catch (e) {}
  }
  function esc(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  document.addEventListener("DOMContentLoaded", function () {
    var st = document.createElement("style");
    st.textContent = "#cd-barra{position:sticky;top:0;z-index:50;display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between;padding:8px 16px;background:rgba(6,22,56,.92);color:#fff;font:14px system-ui,sans-serif;border-bottom:2px solid #f2c14e}#cd-barra a,#cd-barra button{color:#f2c14e;background:none;border:1px solid #f2c14e;border-radius:8px;padding:4px 10px;font:inherit;cursor:pointer;text-decoration:none}#cd-barra .cd-acoes{display:flex;gap:8px}@media print{#cd-barra{display:none}}";
    document.head.appendChild(st);
    var b = document.createElement("div"); b.id = "cd-barra";
    b.innerHTML = '<span class="cd-info">Carregando…</span><span class="cd-acoes"><a href="/meus-dados">Meus dados</a><a class="cd-adm" href="/admin" hidden>Painel admin</a><button type="button" class="cd-sair">Sair</button></span>';
    document.body.prepend(b);
    b.querySelector(".cd-sair").onclick = async function () { await fetch("/api/logout", { method: "POST" }); location.href = "/login"; };
    atualizarBarra();
  });
})();
