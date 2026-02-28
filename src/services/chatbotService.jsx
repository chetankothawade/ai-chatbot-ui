import http from "../utils/http";

const parseStreamLine = (line) => {
  const value = line?.replace(/^data:\s*/, "").trim();
  if (!value || value === "[DONE]") return "";

  try {
    const json = JSON.parse(value);
    return (
      json?.token ??
      json?.delta ??
      json?.content ??
      json?.text ??
      json?.message?.content ??
      ""
    );
  } catch {
    return value;
  }
};

const chatbotService = {
  /**
   * Get all chat sessions
   */
  listSessions: (params = {}) => {
    return http.get("chat/sessions", { params });
  },

  /**
   * Get a single chat session by ID
   */
  getSession: (id) => {
    return http.get(`chat/sessions/${id}`);
  },

  /**
   * Create a new chat session
   */
  createSession: () => {
    return http.post("chat/sessions");
  },

  /**
   * Rename an existing chat session
   */
  renameSession: (id, title) => {
    return http.put(`chat/sessions/${id}`, { title });
  },

  /**
   * Delete a chat session
   */
  deleteSession: (id) => {
    return http.delete(`chat/sessions/${id}`);
  },

  /**
   * Pin or unpin a chat session
   */
  pinSession: (id, pinned) => {
    return http.put(`chat/sessions/${id}`, { pinned });
  },
  /**
   * Toggle pinned state using dedicated endpoint
   */
  togglePin: (id) => {
    return http.patch(`chat/sessions/${id}/pin`);
  },

  /**
   * Clear all messages for a chat session
   */
  clearSessionMessages: (id) => {
    return http.delete(`chat/sessions/${id}/messages`);
  },

  /**
   * Update session context/system prompt
   */
  updateSessionContext: (id, context) => {
    return http.put(`chat/sessions/${id}/context`, { context });
  },

  /**
   * Update model for a session
   */
  updateSessionModel: (id, model) => {
    return http.put(`chat/sessions/${id}/model`, { model });
  },

  /**
   * Send a message in the current chat
   */
  sendMessage: (data) => {
    return http.post("chat/messages/send", data);
  },

  /**
   * List messages (supports filters/pagination)
   */
  listMessages: (params = {}) => {
    return http.get("chat/messages", { params });
  },

  /**
   * Regenerate assistant response for a message
   */
  regenerateMessage: (id) => {
    return http.post(`chat/messages/${id}/regenerate`);
  },

  /**
   * Delete a message
   */
  deleteMessage: (id) => {
    return http.delete(`chat/messages/${id}`);
  },

  /**
   * Stream assistant response as SSE-style chunks.
   * Uses axios download progress so we can keep service-based API calls.
   */
  streamMessage: ({ chatId, message, signal, onChunk }) => {
    let seenLength = 0;
    let pending = "";

    return http.post(
      "chat/messages/stream",
      {
        chat_id: chatId,
        message,
      },
      {
        signal,
        responseType: "text",
        onDownloadProgress: (progressEvent) => {
          const responseText =
            progressEvent?.event?.target?.responseText ??
            progressEvent?.currentTarget?.response ??
            "";

          if (typeof responseText !== "string") return;

          const delta = responseText.slice(seenLength);
          seenLength = responseText.length;

          if (!delta) return;

          pending += delta;
          const lines = pending.split(/\r?\n/);
          pending = lines.pop() ?? "";

          lines.forEach((line) => {
            const text = parseStreamLine(line);
            if (text && typeof onChunk === "function") {
              onChunk(text);
            }
          });
        },
      }
    );
  },

  /**
   * Store metadata for a message
   */
  storeMetadata: (id, data) => {
    return http.post(`chat/messages/${id}/metadata`, data);
  },

  /**
   * Get metadata for a message
   */
  getMetadata: (id) => {
    return http.get(`chat/messages/${id}/metadata`);
  },

  /**
   * Overall usage metrics
   */
  getUsage: (params = {}) => {
    return http.get("chat/usage", { params });
  },

  /**
   * Usage metrics for a specific chat
   */
  getChatUsage: (chatId) => {
    return http.get(`chat/usage/${chatId}`);
  },

  /**
   * Search chat resources
   */
  search: (params = {}) => {
    return http.get("chat/search", { params });
  },

  /**
   * Add participant to session
   */
  addParticipant: (id, userId) => {
    return http.post(`chat/sessions/${id}/participants`, { user_id: userId });
  },

  /**
   * List participants in session
   */
  listParticipants: (id) => {
    return http.get(`chat/sessions/${id}/participants`);
  },

  /**
   * Remove participant from session
   */
  removeParticipant: (id, userId) => {
    return http.delete(`chat/sessions/${id}/participants/${userId}`);
  },
};

export default chatbotService;
