# ALL_bOokS — Gerador de Audiobooks Multi-voz

O **ALL_bOokS** transforma um PDF ou EPUB num audiobook narrado por
múltiplas vozes: extrai o texto, detecta os personagens e o narrador,
atribui uma voz a cada um e sintetiza o áudio final — tudo a partir do
upload de um arquivo.

---

## O que dá pra fazer

- **Enviar um PDF ou EPUB** e acompanhar o job de geração em tempo real.
- **Traduzir o texto** antes da narração (opcional).
- **Detecção automática de personagens**: o texto é analisado e cada fala é
  atribuída ao personagem correto, com uma voz própria por personagem.
- **Escolher entre dezenas de vozes** para narrador e personagens, via
  **Edge TTS** — gratuito.
- **Narrar no próprio navegador**, sem passar pelo servidor, com o
  **Pocket-TTS** — modelo de voz aberto da Kyutai.
- **Baixar o audiobook final** já concatenado num único MP3.
- Acesso protegido por **login**, com conta de administrador.

## Uso de Inteligência Artificial

- **OpenAI** cuida da tradução do texto e da **detecção de personagens**
  (quem fala o quê, ao longo do livro).
- A **narração em si não usa IA generativa de voz paga**. São dois caminhos,
  ambos de custo zero: o **Edge TTS**, no servidor, rápido; ou o **Pocket-TTS**,
  um modelo aberto que roda inteiro na máquina de quem está ouvindo — nada do
  áudio passa pelo servidor, em troca de narrar mais devagar do que se ouve.
- Os jobs de geração rodam em background (threads), então o usuário
  continua usando o site enquanto o audiobook é processado.

## Stack técnica

**Backend** — Flask (Python), jobs assíncronos em thread, concatenação de
áudio via `ffmpeg`.

**Voz no navegador** — Pocket-TTS (ONNX int8) rodando em WebAssembly, com os
pesos vindos do CDN do Hugging Face em revisão fixada.

**Frontend** — React + Vite, servido pelo próprio Flask em produção (mesma
origem, sem CORS).

**Infra** — deploy em container (Railway), com volume persistente para os
áudios gerados. Detalhes em [`DEPLOY.md`](./DEPLOY.md).

---

Projeto pessoal, criado para gerar audiobooks a custo mínimo.
