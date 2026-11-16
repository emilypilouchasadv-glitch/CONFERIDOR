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

## 2. Publicar na internet (exemplo: Render.com)
1. Crie uma conta no GitHub e envie esta pasta para um repositório **privado**.
2. Em https://render.com, clique em **New → Web Service** e escolha o repositório.
   - Build Command: `npm install`
   - Start Command: `npm start`
3. Em **Environment**, adicione:
   - `ANTHROPIC_API_KEY` = sua chave
   - `ADMIN_EMAIL` = seu e-mail
   - `ADMIN_PASSWORD` = uma senha forte
   - `DATA_DIR` = `/var/data`
4. Em **Disks**, adicione um disco montado em `/var/data` (1 GB basta). **Sem o disco, os cadastros se perdem a cada atualização do serviço.** Para isso, o plano precisa ser pago (o mais barato serve).
5. Abra o endereço que o Render mostrar, entre com o e-mail e a senha de administrador e pronto.

Também funciona no Railway, Fly.io, numa VPS (Hostinger, DigitalOcean, etc.) ou em qualquer servidor com Node.js 18 ou mais recente.

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
- `data/db.json`: banco de dados (criado automaticamente; faça backup dele)
