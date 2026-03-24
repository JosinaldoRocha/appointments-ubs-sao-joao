# Guia completo de instalação e publicação

## UBS Agendamentos — Sistema de Vagas

---

## O que você vai precisar (tudo gratuito)

- Conta Google (para o Firebase)
- Node.js instalado no computador: https://nodejs.org (versão 18 ou superior)
- Git (opcional, mas recomendado): https://git-scm.com

---

## PASSO 1 — Criar o projeto no Firebase

1. Acesse https://console.firebase.google.com
2. Clique em **"Adicionar projeto"**
3. Nome do projeto: `ubs-agendamentos` (ou outro de sua escolha)
4. Desative o Google Analytics (não é necessário) → **Criar projeto**
5. Aguarde a criação (1-2 minutos)

---

## PASSO 2 — Ativar os serviços necessários

### 2.1 — Authentication (login)

1. No menu lateral: **Build → Authentication**
2. Clique em **"Começar"**
3. Aba **"Sign-in method"** → clique em **"E-mail/senha"** → Ativar → Salvar

### 2.2 — Firestore Database

1. No menu lateral: **Build → Firestore Database**
2. Clique em **"Criar banco de dados"**
3. Selecione **"Iniciar no modo de produção"** → Avançar
4. Região: **southamerica-east1 (São Paulo)** → Ativar

### 2.3 — Cloud Messaging (notificações push)

1. No menu lateral: **⚙️ Configurações do projeto** (ícone de engrenagem)
2. Aba **"Cloud Messaging"**
3. Em **"Configuração da Web Push"**, clique em **"Gerar par de chaves"**
4. Copie a **Chave VAPID** gerada (você vai precisar dela)

---

## PASSO 3 — Obter as credenciais do Firebase

1. Em **⚙️ Configurações do projeto → Geral**
2. Role até **"Seus apps"** → clique em **"</> Web"**
3. Nome do app: `ubs-web` → Registrar app
4. Copie o objeto `firebaseConfig` que aparece. Exemplo:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "ubs-agendamentos.firebaseapp.com",
  projectId: "ubs-agendamentos",
  storageBucket: "ubs-agendamentos.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
};
```

---

## PASSO 4 — Configurar o projeto

### 4.1 — Cole as credenciais no código

Abra o arquivo `src/services/firebase.js` e substitua todos os `"COLE_AQUI_..."` pelos valores do seu `firebaseConfig`. Adicione também a `vapidKey` obtida no Passo 2.3.

Faça o mesmo no arquivo `public/firebase-messaging-sw.js`.

### 4.2 — Instalar dependências

Abra o terminal na pasta do projeto e execute:

```bash
npm install
```

---

## PASSO 5 — Instalar o Firebase CLI e fazer login

```bash
npm install -g firebase-tools
firebase login
```

Será aberto o navegador para autenticar com sua conta Google.

---

## PASSO 6 — Vincular o projeto Firebase

```bash
firebase use --add
```

Selecione o projeto `ubs-agendamentos` que você criou. Dê o apelido `default`.

---

## PASSO 7 — Publicar as regras do Firestore

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

---

## PASSO 8 — Instalar e publicar as Cloud Functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

> ⚠️ As Cloud Functions exigem o plano **Blaze** (pay-as-you-go) do Firebase.
> Para o volume de uma UBS o custo mensal será **R$ 0,00** (dentro da camada gratuita).
> Você só precisa cadastrar um cartão — não há cobrança automática sem ultrapassar os limites.

---

## PASSO 9 — Popular o banco com os profissionais

### 9.1 — Baixar a chave de serviço

1. **⚙️ Configurações do projeto → Contas de serviço**
2. Clique em **"Gerar nova chave privada"** → Baixar
3. Renomeie o arquivo para `serviceAccountKey.json`
4. Coloque-o dentro da pasta `scripts/`

### 9.2 — Executar o seed

```bash
node scripts/seed.js
```

Você verá: `✅ Profissionais cadastrados no Firestore.`

---

## PASSO 10 — Build e publicação do site

```bash
npm run build
firebase deploy --only hosting
```

Ao final, o terminal mostrará a URL do seu sistema, por exemplo:

```
https://ubs-agendamentos.web.app
```

**Pronto! O sistema está no ar.**

---

## PASSO 11 — Criar o primeiro usuário recepcionista

Como ainda não há usuários, você precisará criar o primeiro via Firebase Console:

1. **Authentication → Usuários → Adicionar usuário**
2. E-mail: `XXXXXXXXXXX@ubs.local` (onde X é o CPF só com números)
   Exemplo: CPF 123.456.789-09 → `12345678909@ubs.local`
3. Senha: defina uma senha inicial
4. Clique em **Adicionar**
5. Copie o **UID** gerado (ex: `abc123xyz`)

Agora crie o documento no Firestore:

1. **Firestore → Dados → Coleção: `usuarios` → Adicionar documento**
2. ID do documento: cole o UID copiado
3. Campos:
   - `nome` (string): Nome do Recepcionista
   - `cpf` (string): 12345678909
   - `role` (string): recepcao
   - `email` (string): 12345678909@ubs.local

**A partir daí, a recepção cria todos os outros usuários pelo próprio sistema** (aba Configurações → Usuários).

---

## PASSO 12 — Instalar como app no celular

### Android (Chrome):

1. Acesse a URL do sistema no Chrome
2. Menu (⋮) → **"Adicionar à tela inicial"**
3. Confirme → o ícone aparece na tela inicial como um app

### iPhone (Safari):

1. Acesse a URL no Safari
2. Botão de compartilhar (□↑) → **"Adicionar à Tela de Início"**
3. Confirme → o ícone aparece na tela inicial

Na primeira vez que abrir, o app pedirá permissão para **enviar notificações** — aceite para receber alertas de vagas esgotadas.

---

## Estrutura de perfis

| Perfil     | Login       | O que pode fazer                                                                                  |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `recepcao` | CPF + senha | Tudo: marcar vagas, confirmar/recusar solicitações, editar nomes de profissionais, criar usuários |
| `agente`   | CPF + senha | Ver vagas disponíveis, enviar solicitações, lista de espera                                       |
| `diretor`  | CPF + senha | Visualizar tudo (somente leitura)                                                                 |

---

## Manutenção

### Alterar nome de um profissional

Sistema → perfil Recepção → aba **Configurações → Profissionais** → editar o nome → Salvar.

### Redefinir senha de um usuário

Firebase Console → **Authentication → Usuários** → clique no usuário → **Redefinir senha**.

### Ver logs de erros

Firebase Console → **Functions → Logs**.

---

## Suporte e dúvidas

Para qualquer dúvida ou ajuste no sistema, entre em contato com o desenvolvedor.
Sistema desenvolvido especificamente para a Unidade Básica de Saúde.
