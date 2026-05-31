# 🔒 Segurança npm — projeto `audiobook app`

> Configurado em **31/05/2026**, após o ataque de supply-chain ao `@tanstack/*` (11/05/2026).
> ✅ Este projeto **NÃO foi afetado** (não usa TanStack). Isto aqui é **prevenção**.

---

## 1. O que foi configurado (arquivo `.npmrc`)

Foi criado um `.npmrc` em `frontend/` (onde fica o `package.json`) com 3 proteções:

| Config | O que faz |
|---|---|
| `ignore-scripts=true` | Bloqueia scripts automáticos das dependências na instalação (`postinstall` etc.). **Foi exatamente assim que o malware do TanStack se ativou.** |
| `min-release-age=7` | **Quarentena de 7 dias**: o npm não instala versão publicada há menos de 1 semana. (Requer npm ≥ 11.10 — você está no **11.16**.) |
| `save-exact=true` | Ao adicionar dependência nova, grava a versão **exata** (sem `^`/`~`). |

Também existe um `.npmrc` **global** em `~/.npmrc` com as mesmas regras.

---

## 2. ✅ REGRA DE OURO: use `npm ci`, NUNCA `npm install`

```bash
cd frontend && npm ci
```

- `npm ci` instala **exatamente** o que está no `package-lock.json`.
- `npm install` pode trocar versões sozinho. **Evite no dia a dia.**

---

## 3. ➕ Adicionar uma dependência nova com segurança

```bash
npm install nome-do-pacote   # SÓ quando for adicionar algo novo
npm ci                       # volte a usar ci depois
```

Se o pacote for muito recente, o `min-release-age` faz o npm pedir uma versão mais antiga — **isso é proteção, não erro.**

---

## 4. 🚀 No deploy (painel web)

Se o painel deixar escolher o comando de instalação, use **`npm ci`**. O `.npmrc` vai junto com o projeto.

---

## 5. 🆘 Se algo der errado

- Pacote legítimo que precisa compilar e falhou: `npm rebuild nome-do-pacote`
- Checar vulnerabilidades: `npm audit`
- Suspeita de pacote malicioso: **não rode `npm install`** e me chame.
