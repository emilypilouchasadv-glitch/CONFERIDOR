// Instruções da IA — ficam só no servidor. O navegador envia apenas o tipo de análise e os dados da tela.
const { COMUM, EXP, EXPR, REF } = require("./regras-edital.json");

const txt = (v, max = 300) => String(v ?? "").replace(/[\r\n]+/g, " ").slice(0, max);
const num = (v) => Math.max(0, Math.min(999, parseInt(v) || 0));
const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "");
const fdt = (s) => s.split("-").reverse().join("/");
const hoje = () => new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const lista = (arr) =>
  (Array.isArray(arr) ? arr.slice(0, 30) : []).map((c) => txt(c && c[0], 20) + ": " + txt(c && c[1], 400)).join(" | ");
const ITENS = Object.keys(REF).filter((k) => k !== "exp");

function item(c) {
  const id = ITENS.includes(c.itemId) ? c.itemId : null;
  if (!id) throw new Error("Item inválido.");
  const esp = [txt(c.esp?.[0], 20), txt(c.esp?.[1], 200)];
  const regra = c.exp && EXP[c.expType] ? EXP[c.expType] + " " + EXPR : txt(c.regra, 3000);
  const fv = c.fv
    ? ` Foram anexados separadamente a FRENTE (${num(c.fv.f)} arquivo(s)) e o VERSO (${c.fv.sem ? "não enviado: a pessoa informou que o documento não tem verso, ou é declaração/certidão ou digital" : num(c.fv.v) + " arquivo(s)"}), nesta ordem: frente primeiro. Se o verso não foi enviado e o documento for um diploma ou certificado que tem verso, aponte (Anexo F).`
    : "";
  return `Você confere documentos para a etapa Entrega de Documentos do edital AVICON QSCon 2027 (Comando da Aeronáutica, ${txt(c.serep, 40) || "SEREP"}).
Especialidade do voluntário: ${esp[0]} – ${esp[1]}.
Item do checklist: ${txt(c.itemTitulo, 200)}.
Regras do edital para este item: ${regra}
${COMUM}
As imagens anexas são as páginas do(s) documento(s) enviado(s)${c.cortou ? " (apenas as primeiras foram enviadas)" : ""}.${fv} Data de hoje: ${hoje()}.
Verifique as exigências com o que é visível. Use "atencao" só se uma informação necessária realmente não puder ser lida (diga qual). Não invente dados. Se o arquivo não for o documento do item, use "nao_conforme".
Itens do edital aplicáveis a este documento: ${REF[id]}.
${id === "fi" ? `Neste item preencha "dados" com o que estiver LEGÍVEL na ficha (nome completo, número de inscrição, data de nascimento, SEREP, localidade, especialidade); use "Não consta" se não houver. ` : ""}${id === "cur" ? `Neste item liste em "dados" TODOS os certificados visíveis, um por linha, com nome do curso, carga horária e instituição. ` : ""}Seja BREVE e direto, para uma pessoa leiga. A imagem é a foto de um documento em folha A4: NÃO comente sombra, brilho, enquadramento ou qualidade da foto. Só aponte falta de legibilidade se uma parte realmente não puder ser lida, dizendo qual parte.
Liste no máximo 3 problemas, só os que descumprem o edital. "item" = número do item do edital e nome curto (use apenas numerações da lista acima, ex.: "Item 5.4.12.3 – CTPS e CNIS"); "erro" = 1 frase curta; "como_corrigir" = 1 frase curta e prática.${id === "id" ? `
Este item é a identificação. Preencha "dados" com 6 campos: Documento (tipo), Número (como aparece no documento), Validade (a data, ou "Sem validade" se o documento não tem prazo, ou "Não consta"), CPF (o número, se constar no documento, ou "Não consta"), Nome completo (como no documento) e Data de nascimento (DD/MM/AAAA, ou "Não consta"). Se a validade estiver vencida (compare com a data de hoje), registre como problema (item 5.2.10).` : ""}
Responda SOMENTE com JSON: {"status":"conforme"|"atencao"|"nao_conforme","resumo":"máximo 12 palavras","problemas":[{"item":"...","erro":"...","como_corrigir":"..."}]${id === "id" ? `,"dados":[{"campo":"Documento","valor":"..."},{"campo":"Número","valor":"..."},{"campo":"Validade","valor":"..."},{"campo":"CPF","valor":"..."},{"campo":"Nome completo","valor":"..."},{"campo":"Data de nascimento","valor":"..."}]` : id === "fi" ? `,"dados":[{"campo":"Nome completo","valor":"..."},{"campo":"Número de inscrição","valor":"..."},{"campo":"Data de nascimento","valor":"..."},{"campo":"SEREP","valor":"..."},{"campo":"Localidade","valor":"..."},{"campo":"Especialidade","valor":"..."}]` : id === "cur" ? `,"dados":[{"campo":"Curso","valor":"nome – carga horária em horas – instituição (um item por certificado)"}]` : id === "em" || id === "tec" || id === "hist" ? `,"dados":[{"campo":"Curso","valor":"nome – carga horária (se constar) – instituição"}]` : ""}}. Se estiver conforme, problemas = [].`;
}

function pontAuto(c) {
  const tsg = !!c.tsg;
  return `Extraia dados de pontuação do edital AVICON QSCon 2027 (especialidade ${txt(c.esp?.[0], 20)} – ${txt(c.esp?.[1], 200)}) das imagens anexas.\nCategorias de cursos válidas (id: descrição): ${lista(c.cats)}\n${tsg ? `Tipos de período válidos (id: descrição): ${lista(c.exps)}\n` : ""}Regras: só inclua cursos cuja carga horária esteja visível e que se encaixem em uma categoria (classifique pela carga horária); ${tsg ? "só inclua períodos com data de início e fim explícitas (AAAA-MM-DD); " : ""}nunca invente dados; ignore o que não se encaixar. Um item por documento.\nResponda SOMENTE JSON: {"cursos":[{"c":"id da categoria","n":"nome do curso e carga horária"}]${tsg ? `,"periodos":[{"t":"id do tipo","i":"AAAA-MM-DD","f":"AAAA-MM-DD"}]` : ""}}`;
}

function pontManual(c) {
  return `Extraia dados de pontuação do edital AVICON QSCon 2027 (especialidade ${txt(c.esp?.[0], 20)} – ${txt(c.esp?.[1], 200)}) das imagens anexas.\nCategorias de cursos válidas (id: descrição): ${lista(c.cats)}\nTipos de período válidos (id: descrição): ${lista(c.exps)}\nRegras: só inclua períodos com data de início e fim explícitas no documento (formato AAAA-MM-DD); só inclua cursos cuja carga horária esteja visível e que se encaixem em uma categoria; nunca invente dados; ignore o que não se encaixar. Experiência de sócio/proprietário, estágio, voluntariado, monitoria e bolsa não entram.\nResponda SOMENTE JSON: {"periodos":[{"t":"id do tipo","i":"AAAA-MM-DD","f":"AAAA-MM-DD"}],"cursos":[{"c":"id da categoria","n":"nome do curso e carga horária"}]}`;
}

function vinculo(c) {
  const k = EXP[c.k] ? c.k : null;
  if (!k) throw new Error("Tipo de vínculo inválido.");
  const i = data(c.i), f = data(c.f);
  return `Você confere um comprovante de experiência profissional para o edital AVICON QSCon 2027 (Comando da Aeronáutica, ${txt(c.serep, 40) || "SEREP"}).
Especialidade: ${txt(c.esp?.[0], 20)} – ${txt(c.esp?.[1], 200)}. Tipo de vínculo: ${txt(c.tipoNome, 120)}. Empresa/órgão informado: ${txt(c.nome, 200) || "não informado"}. Datas informadas pela pessoa: ${i ? fdt(i) : "não informada"} a ${f ? fdt(f) : "não informada"}.
Regras do edital para este tipo: ${EXP[k]} ${EXPR}
${COMUM}
Itens do edital aplicáveis: ${REF.exp}.
${k === "pri" ? `Foram enviados DOIS conjuntos, nesta ordem: primeiro a CTPS (${num(c.ctps)} arquivo(s)) e depois o CNIS (${num(c.cnis)} arquivo(s)). Confirme que cada um é do tipo informado. ` : ""}As imagens são as páginas enviadas. Data de hoje: ${hoje()}. Confira o que está visível. Use "atencao" só se uma informação necessária realmente não puder ser lida (diga qual). Não comente sombra ou qualidade da foto. Não invente. Se o arquivo não for o comprovante desse tipo, use "nao_conforme". Se as datas do documento forem diferentes das informadas, aponte.
Seja BREVE, para uma pessoa leiga. No máximo 3 problemas. "item" = número do item do edital e nome curto (ex.: "Item 5.4.12.3 – CTPS e CNIS"); "erro" = 1 frase curta; "como_corrigir" = 1 frase curta e prática.
Responda SOMENTE com JSON: {"status":"conforme"|"atencao"|"nao_conforme","resumo":"1 frase simples","inicio":"AAAA-MM-DD ou null","fim":"AAAA-MM-DD ou null","empresa":"empresa ou órgão que consta no documento","funcao":"cargo/função e atividades, em até 15 palavras","problemas":[{"item":"...","erro":"...","como_corrigir":"..."}]}. Em inicio e fim coloque as datas que aparecem no documento, se visíveis. Se estiver conforme, problemas = [].`;
}

const TIPOS = { item, pontAuto, pontManual, vinculo };

function montarPrompt(tipo, ctx) {
  const fn = TIPOS[tipo];
  if (!fn) throw new Error("Tipo de análise inválido.");
  return fn(ctx || {});
}

module.exports = { montarPrompt };
