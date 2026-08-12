# Desenvolvimento e deploy

## Como funciona

- **Backend (`app.py`)**: API Flask. Os jobs de geração rodam em *threads* em
  background e o estado fica **em memória** (dict `JOBS`). Os áudios são gravados
  em disco (`OUTPUT_DIR`). A concatenação dos MP3s usa **ffmpeg**.
- **Frontend (`frontend/`)**: SPA React buildada com Vite. Em produção o próprio
  Flask serve a `frontend/dist` no mesmo host (`BASE = ''`), então não há CORS.

## Rodar localmente

Pré-requisitos: Python 3.12+, Node 20+, `ffmpeg` no PATH.

```bash
cp .env.example .env        # cole sua OPENAI_API_KEY
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd frontend && npm install && cd ..
./run.sh                    # sobe Flask (:5000) + Vite (:5173)
```

## Variáveis de ambiente

| Var | Default | Descrição |
|-----|---------|-----------|
| `OPENAI_API_KEY` | — | Chave da OpenAI (tradução + detecção de personagens) |
| `AI_DETECT_MODEL` | `gpt-5.4-mini-...` | Modelo pra detectar personagens |
| `TRANSLATE_REASONING` | `none` | Esforço de raciocínio na tradução |
| `OUTPUT_DIR` | `./outputs` | Onde os áudios ficam salvos |
| `TTS_CONCURRENCY` | `5` | Requisições TTS em paralelo |
| `ADMIN_USER` | `admin` | Usuário do login |
| `ADMIN_PASSWORD` | *(ver aviso abaixo)* | Senha do admin |
| `SECRET_KEY` | gerada e persistida no volume | Assinatura dos cookies de sessão |
| `COOKIE_SECURE` | `1` | Cookie só por HTTPS (use `0` só pra testar fora de localhost) |

> ⚠️ **Sempre defina `ADMIN_PASSWORD` em produção.** Sem essa variável, o admin é
> semeado com uma senha padrão fixa no código (`audiobook/auth.py`) — aceitável
> para rodar local, **não** para uma instância pública.

## Deploy

Este app **não é estático** — precisa de um servidor sempre ligado, sistema de
arquivos e `ffmpeg`. Por isso:

- **GitHub Pages** ❌ — só serve arquivos estáticos.
- **Cloudflare Workers** ❌ — sem filesystem persistente, com limites de CPU/tempo
  e sem ffmpeg/threads longas.
- **Railway** ✅ — container persistente com Python + ffmpeg.

### Railway

1. *New Project → Deploy from GitHub repo* e selecione este repo.
2. O `Dockerfile` é detectado automaticamente (builda o frontend e instala ffmpeg).
3. Em **Variables**, defina `OPENAI_API_KEY` e `ADMIN_PASSWORD` (e os opcionais acima).
4. Adicione um **Volume** montado em `/data` para os áudios sobreviverem a deploys
   (o container já usa `OUTPUT_DIR=/data/outputs`).
5. *Generate Domain* pra ter a URL pública.

> ⚠️ Os jobs vivem em memória, então rode **uma única instância** (sem autoscale).
> Reiniciar o serviço perde os jobs em andamento.
