# AI Chatbot UI (React + Vite)

Detailed documentation for the chatbot admin UI in this repository.

## 1. Purpose

The Chatbot UI provides an admin-facing chat workspace with:

- Chat session management
- Real-time assistant streaming
- Message-level actions
- Session context/model controls
- Usage visibility
- Participant add/remove management

Primary screen:

- `src/pages/admin/chatbot/List.jsx`

Primary API service:

- `src/services/chatbotService.jsx`

## 2. Tech Stack

- React 19
- Vite 7
- React Bootstrap 5 + Bootstrap 5
- Axios
- React Markdown
- SimpleBar
- SweetAlert2
- React Hook Form
- React Select

## 3. Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+
- Laravel API running and reachable from UI

## 4. Environment

This project currently uses `.env.development`.

Required key:

```env
VITE_API_BASE_URL=http://localhost:8020/api/
```

Optional keys currently used in project:

```env
VITE_ENV_NAME=development
VITE_SITE_NAME=CANK
```

## 5. Setup and Run

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Build production assets:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

Lint:

```bash
npm run lint
```

## 6. Chatbot UI Features

### 6.1 Sessions (left panel)

- Load sessions with cursor pagination
- Search sessions
- Filter sessions (`All`, `Today`, `Last 7 Days`)
- Pin/unpin session
- Rename session
- Delete session
- Create new chat

### 6.2 Conversation area (right panel)

- Select model per session
- Edit session context
- View overall usage
- View chat-specific usage
- Clear session messages
- Send user messages
- Stream assistant response with typing effect
- Stop streaming response
- Markdown rendering for assistant messages
- Copy code block content

### 6.3 Message actions

For persisted messages (non-draft):

- Regenerate assistant response
- View metadata
- Save metadata
- Delete message

### 6.4 Participant management

- Add participant via searchable user select
- Remove participant via searchable participant select
- Remove list now shows only users already added to that chat

## 7. API Integration Map

The UI expects API prefix `.../api/chat/*`.

### 7.1 Session endpoints

- `GET chat/sessions`
- `POST chat/sessions`
- `GET chat/sessions/{id}`
- `PUT chat/sessions/{id}`
- `DELETE chat/sessions/{id}`
- `PATCH chat/sessions/{id}/pin`
- `PUT chat/sessions/{id}/model`
- `PUT chat/sessions/{id}/context`
- `DELETE chat/sessions/{id}/messages`

### 7.2 Message endpoints

- `POST chat/messages/send`
- `POST chat/messages/stream`
- `GET chat/messages`
- `POST chat/messages/{id}/regenerate`
- `DELETE chat/messages/{id}`

### 7.3 Metadata endpoints

- `GET chat/messages/{id}/metadata`
- `POST chat/messages/{id}/metadata`

### 7.4 Usage endpoints

- `GET chat/usage`
- `GET chat/usage/{chat_id}`

### 7.5 Participants endpoints

- `GET chat/sessions/{id}/participants`
- `POST chat/sessions/{id}/participants`
- `DELETE chat/sessions/{id}/participants/{user_id}`

## 8. Important Payload Contracts

### 8.1 Stream message request

```json
{
  "chat_id": 12,
  "message": "Hello"
}
```

### 8.2 Update context request

`context` is sent as object/array or null:

```json
{
  "context": {
    "system": "You are a helpful assistant"
  }
}
```

### 8.3 Add participant request

```json
{
  "user_id": 7
}
```

### 8.4 Save metadata request

```json
{
  "type": "manual",
  "meta": {
    "source": "admin"
  }
}
```

## 9. Response Normalization

Because some backend responses can vary, UI normalizes:

- Sessions arrays (`data`, nested `data.data`, etc.)
- Session details (`chat`, `session` wrappers)
- Messages arrays (`messages`, `data.messages`, `data`)
- Cursor pagination metadata

Normalization helpers are inside `List.jsx` near top of file.

## 10. Search Behavior

Session search in left panel uses:

- `GET chat/sessions?search=<term>&limit=50`

Note:

- Endpoint `chat/search` returns message search results and is not used for session sidebar listing.

## 11. Participant UX Behavior

### Add User

- Opens modal with `react-select`
- Source: `users/getList`
- Submit calls: `POST chat/sessions/{id}/participants`

### Remove User

- Opens modal with `react-select`
- Source: `GET chat/sessions/{id}/participants`
- Submit calls: `DELETE chat/sessions/{id}/participants/{user_id}`

## 12. UI/UX Notes

- 3-dot action toggles hide default bootstrap caret arrow (only dots visible)
- Tooltips are attached to major action buttons
- Streaming has stop control and typing cursor indication
- Code blocks include copy-to-clipboard

## 13. File Reference (Chatbot Module)

- `src/pages/admin/chatbot/List.jsx`
- `src/services/chatbotService.jsx`
- `src/services/userService.jsx`
- `src/components/FormFields/FormField.jsx`
- `src/index.css` (chat-specific style tweaks)

## 14. Common Issues and Fixes

### Issue: Add participant fails

Check:

- `users/getList` returns valid users
- Selected value is numeric `user_id`
- `POST chat/sessions/{id}/participants` exists and is authenticated

### Issue: Remove participant list shows all users

Expected fix already integrated:

- Remove modal should call `GET chat/sessions/{id}/participants`
- If still not correct, verify backend route/controller for participants index

### Issue: Context update fails (422)

Check:

- `context` request is JSON object/array/null
- Route `PUT chat/sessions/{id}/context` exists

### Issue: Message delete fails

Check backend route points to `destroy` action:

- `Route::delete('messages/{id}', [MessageController::class, 'destroy']);`

## 15. Quick QA Checklist

1. Create new chat.
2. Send prompt and confirm streaming response appears.
3. Rename chat and verify list updates.
4. Pin/unpin chat and verify sort order.
5. Edit context and verify save success.
6. Change model and verify save success.
7. Add participant from user list.
8. Remove participant from participant-only list.
9. Open message actions and test metadata save/view.
10. Delete message and confirm it disappears.
11. Clear messages and confirm chat body resets.
12. Verify button tooltips and 3-dot toggle visuals.

## 16. Scripts Summary

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run preview` - preview build
- `npm run lint` - lint code

---

If you extend the chatbot (file upload, prompt templates, multi-model fallback, conversation export), update this README and `chatbotService.jsx` together so UI and API contracts stay aligned.
# ai-chatbot-ui
