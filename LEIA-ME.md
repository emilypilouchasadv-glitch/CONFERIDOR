# Conferidor de Documentos: versão independente

O Conferidor que foi feito no Claude.ai, agora fora dele, com:

- **Login e senha** para cada pessoa.
- **Cadastro**: quem se cadastra fica *pendente* até você liberar.
- **Painel do administrador** (`/admin`): lista de cadastrados (nome, e-mail, telefone, data de cadastro, último acesso, uso), busca, filtros e exportação em CSV (Excel).
- **Liberação por 3 dias, 7 dias, 15 dias, 30 dias ou 1 ano**, com a opção "somar ao prazo atual" para renovar. Quando o prazo acaba, o acesso é bloqueado sozinho.
- **Habilitar / Desabilitar** a qualquer momento.
- **Limites de uso**: análises por dia e análises no total (0 = sem limite), além de zerar o uso, trocar a senha, excluir o usuário e anotar observações.
- **Histórico** de cadastros, logins, liberações e análises.

A análise dos documentos usa a API da Anthropic (Claude) com a **sua chave**. A chave fica só no servidor e os usuários nunca a veem.

## 1. Obter a chave da API
1. Acesse https://console.anthropic.com, crie uma conta e adicione créditos (Billing).
2. Em **API Keys**, crie uma chave (começa com `sk-ant-`).

> Custo: cada análise envia até 6 imagens. O modelo padrão é o `claude-opus-5-5`, o mais preciso.
> Para gastar menos, defina `CLAUDE_MODEL=claude-sonnet-5-5` (mais barato) ou `claude-haiku-5-5` (o mais barato).

## 2. Publicar de graça (Render + Neon)
1. **Banco de dados gratuito:** entre em https://neon.tech (use "Continue with GitHub"), crie um projeto e copie a *connection string* (começa com `postgresql://`).
2. **Site gratuito:** em https://dashboard.render.com/web/new, escolha o repositório, depois:
   - Language: Node · Build Command: `npm install` · Start Command: `npm start` · Instance Type: **Free**
   - Environment Variables: `ANTHROPIC_API_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `DATABASE_URL` (a connection string do Neon)
3. Clique em **Deploy Web Service** e aguarde aparecer **Live**.

No plano gratuito, o site "dorme" depois de 15 minutos sem uso. O primeiro acesso depois disso leva cerca de 1 minuto para carregar; os próximos são normais.
Os cadastros ficam salvos no Neon e não se perdem.

## 3. Rodar no próprio computador (teste)
```
npm install
cp .env.example .env     (depois edite o .env com sua chave e a senha de admin)
npm start
```
Depois acesse http://localhost:3000

## Como usar
- **Usuários:** acessam o endereço, clicam em *Criar conta* e aguardam a liberação.
- **Você:** entra em `/admin`, clica em **Liberar** e escolhe o período. Em **Limites**, define quantas análises a pessoa pode fazer.
- Botão **Novo usuário**: cria uma conta já liberada (útil para quem paga direto com você).
- O limite padrão para novos cadastros é de 20 análises por dia. Para mudar, use `LIMITE_DIA_PADRAO` e `LIMITE_TOTAL_PADRAO`.

## Arquivos
- `server.js`: servidor (login, cadastro, painel, limites e chamada ao Claude)
- `views/conferidor-original.html`: o seu Conferidor, sem alterações
- `public/shim.js`: liga o Conferidor ao servidor e mostra a barra com o nome e o uso
- `public/login.html`, `public/admin.html`, `public/sem-acesso.html`: telas novas
- `data/db.json`: banco de dados quando não há `DATABASE_URL` (uso local)

## Proteção de dados (LGPD)
- Os documentos enviados **não são guardados**: são convertidos em imagem no navegador (o que remove os metadados), passam pelo servidor só durante a análise e são descartados. O resultado fica apenas na tela da pessoa.
- No cadastro, a pessoa precisa aceitar a **Política de Privacidade** (`/privacidade`). A data do aceite fica registrada. Contas criadas pelo administrador aceitam no primeiro acesso.
- Em **Meus dados** (`/meus-dados`), cada pessoa pode ver e baixar os seus dados, corrigir o nome e o telefone e excluir a conta. A exclusão apaga também o histórico da pessoa.
- O histórico de ações é apagado automaticamente após 180 dias.
- Defina `CONTROLADOR_NOME` e `CONTROLADOR_EMAIL` no Render para identificar o responsável pelos dados na política.
