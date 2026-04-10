# AI Chatbot UI

React + Vite admin chat UI for managing chat sessions, streaming assistant responses, and voice input.

## Tech Stack

- React 19
- Vite 7
- Axios
- React Bootstrap + Bootstrap 5
- React Markdown
- SimpleBar
- SweetAlert2
- React Hook Form

## Requirements

- Node.js 18+
- npm 9+
- Laravel API running and reachable

## Environment

Create or update `.env.development`:

```env
VITE_API_BASE_URL=http://localhost:8020/api/
VITE_ENV_NAME=development
VITE_SITE_NAME=NACK
```

## Setup

Install dependencies:

```bash
npm install
```

Run dev server:

```bash
npm run dev
```

Build production assets:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

## Main Chat Module

Primary files:

- `src/pages/admin/chatbot/List.jsx`
- `src/services/chatbotService.jsx`

## Features

### Sessions

- load sessions with cursor pagination
- search sessions
- filter sessions
- create chat
- rename chat
- pin and unpin chat
- delete chat

### Conversation

- send typed messages
- stream assistant replies with typing effect
- stop in-progress stream
- render markdown answers
- copy code blocks
- clear session messages
- change session model
- edit session context

### Message Actions

- regenerate assistant reply
- view metadata
- save metadata
- delete message

### Participants

- add participant
- remove participant

### Voice Input

- microphone button in the chat composer
- browser recording using `MediaRecorder`
- live audio level meter while recording
- auto-stop after 120 seconds
- mobile-safe stop on tab/background change
- recorded audio uploaded to backend transcription endpoint
- transcription auto-sent as a chat message after success

## API Integration Map

The UI expects API prefix:

```text
.../api/chat/*
```

### Sessions

- `GET chat/sessions`
- `POST chat/sessions`
- `GET chat/sessions/{id}`
- `PUT chat/sessions/{id}`
- `DELETE chat/sessions/{id}`
- `PATCH chat/sessions/{id}/pin`
- `PUT chat/sessions/{id}/model`
- `PUT chat/sessions/{id}/context`
- `DELETE chat/sessions/{id}/messages`

### Messages

- `POST chat/messages/send`
- `POST chat/messages/stream`
- `POST chat/messages/transcribe`
- `GET chat/messages`
- `POST chat/messages/{id}/regenerate`
- `DELETE chat/messages/{id}`

### Metadata

- `GET chat/messages/{id}/metadata`
- `POST chat/messages/{id}/metadata`

### Usage

- `GET chat/usage`
- `GET chat/usage/{chat_id}`

### Participants

- `GET chat/sessions/{id}/participants`
- `POST chat/sessions/{id}/participants`
- `DELETE chat/sessions/{id}/participants/{user_id}`

## Important Payloads

### Stream Message

```json
{
  "chat_id": 12,
  "message": "Hello"
}
```

### Voice Transcription Upload

Multipart form data:

- `audio` file
- `language` optional
- `prompt` optional

Example response:

```json
{
  "status": true,
  "message": "Voice transcribed",
  "data": {
    "text": "Create a summary of this conversation",
    "language": "en",
    "duration": 5.1
  }
}
```

### Update Context

```json
{
  "context": {
    "system": "You are a helpful assistant"
  }
}
```

### Add Participant

```json
{
  "user_id": 7
}
```

### Save Metadata

```json
{
  "type": "manual",
  "meta": {
    "source": "admin"
  }
}
```

## Response Normalization

The UI normalizes backend response variants for:

- sessions arrays
- session details
- message arrays
- cursor pagination metadata

Normalization helpers are in:

- `src/pages/admin/chatbot/List.jsx`

## UX Notes

- mic button toggles record and stop states
- while recording, the text input stays visible and the voice meter updates live
- while transcribing, send and mic actions are disabled
- after transcription succeeds, the text is sent immediately instead of waiting in the input
- streamed assistant replies still use the existing typing ticker behavior

## Build Status

The frontend build now completes successfully with `npm run build`.

Non-blocking warnings may still appear for:

- unresolved runtime asset references
- large bundle chunks

## QA Checklist

1. Create a new chat.
2. Send a typed message and verify streaming response.
3. Click mic and record voice.
4. Stop recording and verify transcription is auto-sent.
5. Confirm live meter moves while speaking.
6. Confirm recording stops safely if tab is backgrounded.
7. Rename and pin a chat.
8. Edit session context and model.
9. Add and remove participant.
10. Open message actions and test metadata.
11. Build with `npm run build`.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`
